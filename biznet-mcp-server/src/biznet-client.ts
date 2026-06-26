import axios, { AxiosInstance, AxiosError } from "axios";
import https from "https";
import tls from "tls";

const BASE_URL = process.env.BIZNET_BASE_URL ?? "https://cust05.isokonbpm.com";
const USERNAME = process.env.BIZNET_USERNAME ?? "";
const PASSWORD = process.env.BIZNET_PASSWORD ?? "";

// The CRM serves an expired certificate with a mismatched CN, so standard TLS
// verification cannot pass. Instead of disabling verification entirely, we pin
// the known certificate's SHA-256 fingerprint: the expired cert is accepted,
// but any other certificate (e.g. a man-in-the-middle) is rejected.
// If the CRM's certificate is legitimately replaced, set BIZNET_CERT_FINGERPRINT.
const PINNED_CERT_FINGERPRINT =
  process.env.BIZNET_CERT_FINGERPRINT ??
  "15:16:FC:34:C6:09:4D:C8:FF:F0:20:DB:B6:26:CB:42:51:3B:C6:49:79:AD:FB:E2:A3:C2:A2:7C:E2:80:AF:5C";

// Pinning must be enforced on the socket after the handshake: with
// rejectUnauthorized=false, Node records checkServerIdentity failures in
// socket.authorizationError but does NOT abort the connection.
class PinnedHttpsAgent extends https.Agent {
  createConnection(options: unknown, callback: unknown): tls.TLSSocket {
    const socket = (
      https.Agent.prototype as unknown as {
        createConnection(o: unknown, c: unknown): tls.TLSSocket;
      }
    ).createConnection.call(this, options, callback);
    socket.once("secureConnect", () => {
      const fp = socket.getPeerCertificate().fingerprint256;
      if (fp !== PINNED_CERT_FINGERPRINT) {
        socket.destroy(
          new Error(
            `TLS certificate fingerprint mismatch for ${BASE_URL}: possible man-in-the-middle. ` +
              `Expected ${PINNED_CERT_FINGERPRINT}, got ${fp}. ` +
              `If the CRM's certificate was legitimately replaced, update BIZNET_CERT_FINGERPRINT.`
          )
        );
      }
    });
    return socket;
  }
}

export interface BiznetResponse<T = unknown> {
  Status: boolean;
  Message: string;
  Argument: T;
}

export interface NameValueItem {
  Name: string;
  Value: string;
}

export interface IdNameItem {
  Id: number;
  Name: string;
}

export interface ContactDetail {
  Id: number;
  FirstName: string;
  LastName: string;
  Type: string;
  Phone: string;
  MobilePhone: string;
  Email: string;
  Fax: string;
  Position: string;
  Title: string;
  Marital: string;
  BirthDay: string;
  Status: string;
  ClientRef: string;
  OrganisationId: number;
  DepartmentId: number;
  Facebook: string;
  Instagram: string;
  Twitter: string;
  LinkedIn: string;
}

export interface CaseItem {
  Id: number;
  Name: string;
  Workflow?: string;
  User?: string;
  Manager?: string;
  Reference?: string;
}

export interface MatterItem {
  Id: string;
  Name: string;
}

export interface ObjectTypeField {
  Name: string;
  Type: string;
  DisplayMode: string;
}

export interface ObjectTypeInfo {
  Name: string;
  Type: string;
  Fields: ObjectTypeField[];
}

class BiznetClient {
  private http: AxiosInstance;
  private cookieHeader: string = "";
  private loggedIn: boolean = false;

  constructor() {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      maxRedirects: 0,
      validateStatus: (s) => s < 400,
      // maxCachedSessions: 0 forces a full TLS handshake on every connection —
      // resumed sessions don't re-send the certificate, breaking the pin check.
      httpsAgent: new PinnedHttpsAgent({ rejectUnauthorized: false, maxCachedSessions: 0 }),
    });
  }

  private extractCookies(setCookieHeaders: string[] | string | undefined): string {
    if (!setCookieHeaders) return "";
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    return headers.map((c) => c.split(";")[0]).join("; ");
  }

  async login(): Promise<void> {
    if (!USERNAME || !PASSWORD) {
      throw new Error(
        "BIZNET_USERNAME and BIZNET_PASSWORD environment variables must be set"
      );
    }

    // GET login page to capture any session cookies
    const pageRes = await this.http.get("/Account/Login").catch(() => null);
    let cookies = "";
    if (pageRes) {
      cookies = this.extractCookies(pageRes.headers["set-cookie"] as string[] | undefined);
    }

    // POST login credentials
    const params = new URLSearchParams({
      userName: USERNAME,
      Password: PASSWORD,
    });

    const loginRes = await this.http.post("/Account/Login", params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(cookies ? { Cookie: cookies } : {}),
      },
    });

    // A successful BizNet login responds with a 302 redirect away from the
    // login page. A failed login returns 200 and re-renders /Account/Login.
    // The server hands out a session cookie either way, so the presence of a
    // cookie does NOT indicate success — we must check the redirect.
    const status = loginRes.status;
    const location = (loginRes.headers["location"] as string | undefined) ?? "";
    const loginSucceeded =
      status >= 300 && status < 400 && !/\/Account\/Login/i.test(location);

    if (!loginSucceeded) {
      throw new Error(
        `Login failed: BizNet rejected the credentials for user "${USERNAME}". ` +
          `Check BIZNET_USERNAME and BIZNET_PASSWORD.`
      );
    }

    const allCookies = [
      ...(pageRes?.headers["set-cookie"] ?? []),
      ...(loginRes.headers["set-cookie"] ?? []),
    ] as string[];

    this.cookieHeader = this.extractCookies(allCookies);

    if (!this.cookieHeader) {
      throw new Error("Login failed: no session cookie returned.");
    }

    this.loggedIn = true;
  }

  private async ensureLoggedIn(): Promise<void> {
    if (!this.loggedIn) {
      await this.login();
    }
  }

  private authHeaders() {
    return {
      Cookie: this.cookieHeader,
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    await this.ensureLoggedIn();
    try {
      const res = await this.http.get<T>(path, {
        params,
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        validateStatus: (s) => s < 500,
      });

      // Detect redirect to login (session expired)
      if (res.status === 302 || res.status === 301) {
        this.loggedIn = false;
        await this.login();
        const retry = await this.http.get<T>(path, {
          params,
          headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        });
        return retry.data;
      }

      return res.data;
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    await this.ensureLoggedIn();
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) {
          params.append(k, String(v));
        }
      }

      const res = await this.http.post<T>(path, params.toString(), {
        headers: this.authHeaders(),
        validateStatus: (s) => s < 500,
      });

      // Detect redirect to login
      if (res.status === 302 || res.status === 301) {
        this.loggedIn = false;
        await this.login();
        const retry = await this.http.post<T>(path, params.toString(), {
          headers: this.authHeaders(),
        });
        return retry.data;
      }

      return res.data;
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  private wrapError(err: unknown): Error {
    if (err instanceof AxiosError) {
      if (err.response) {
        return new Error(
          `HTTP ${err.response.status}: ${err.response.statusText}. Check BIZNET_BASE_URL is reachable.`
        );
      }
      if (err.code === "ECONNABORTED") return new Error("Request timed out. CRM server may be slow.");
      if (err.code === "ECONNREFUSED") return new Error("Connection refused. Is the CRM server running?");
      if (err.code === "ENOTFOUND") return new Error(`DNS lookup failed for ${BASE_URL}. Check BIZNET_BASE_URL.`);
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}

// Singleton — one session per process
export const biznet = new BiznetClient();
