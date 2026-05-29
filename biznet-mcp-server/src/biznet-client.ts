import axios, { AxiosInstance, AxiosError } from "axios";
import https from "https";

const BASE_URL = process.env.BIZNET_BASE_URL ?? "https://cust05.isokonbpm.com";
const USERNAME = process.env.BIZNET_USERNAME ?? "";
const PASSWORD = process.env.BIZNET_PASSWORD ?? "";

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
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
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

    const allCookies = [
      ...(pageRes?.headers["set-cookie"] ?? []),
      ...(loginRes.headers["set-cookie"] ?? []),
    ] as string[];

    this.cookieHeader = this.extractCookies(allCookies);

    if (!this.cookieHeader) {
      throw new Error("Login failed: no session cookie returned. Check credentials.");
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
