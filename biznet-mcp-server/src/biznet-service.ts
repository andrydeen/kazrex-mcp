// Single source of truth for all BizNet CRM operations.
// Both the MCP tools and the REST API routes in index.ts call these functions —
// never call biznet endpoints directly from index.ts, or the two interfaces drift.
// Endpoint choices here are the verified-working ones (see BIZNET-API.md).

import {
  biznet,
  BiznetResponse,
  IdNameItem,
  NameValueItem,
  ContactDetail,
  CaseItem,
  MatterItem,
  ObjectTypeInfo,
} from "./biznet-client.js";

/** Thrown when the CRM responds with Status:false. */
export class BiznetApiError extends Error {}

function unwrap<T>(res: BiznetResponse<T>): T {
  if (!res.Status) throw new BiznetApiError(res.Message || "Unknown error from CRM");
  return res.Argument;
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export function listContacts(): Promise<IdNameItem[]> {
  return biznet.get<IdNameItem[]>("/Clients/GetPrimaryList");
}

export function getContact(id: number | string): Promise<ContactDetail> {
  return biznet.get<ContactDetail>("/Clients/GetCustomerDetails", { id });
}

export function searchContactsByPhone(phone: string): Promise<IdNameItem[]> {
  return biznet.get<IdNameItem[]>("/Clients/GetCustomerLookupByPhone", { phone });
}

export function listContactTypes(): Promise<string[]> {
  return biznet.get<string[]>("/Clients/GetPrimaryObjectTypes");
}

export interface ContactParams {
  type: string;
  lname: string;
  fname?: string;
  title?: string;
  phone?: string;
  mobilephone?: string;
  email?: string;
  fax?: string;
  organisation?: number;
  department?: number;
  position?: string;
  clientRef?: string;
  clientStatus?: string;
  birthday?: string;
  marital?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
}

function contactBody(id: number, p: ContactParams): Record<string, unknown> {
  return {
    id,
    type: p.type,
    lname: p.lname,
    fname: p.fname ?? "",
    title: p.title ?? "",
    phone: p.phone ?? "",
    mobilephone: p.mobilephone ?? "",
    email: p.email ?? "",
    fax: p.fax ?? "",
    organisation: p.organisation ?? 0,
    department: p.department ?? 0,
    position: p.position ?? "",
    clientRef: p.clientRef ?? "",
    clientStatus: p.clientStatus ?? "",
    birthday: p.birthday ?? "",
    marital: p.marital ?? "",
    facebook: p.facebook ?? "",
    instagram: p.instagram ?? "",
    twitter: p.twitter ?? "",
    linkedin: p.linkedin ?? "",
  };
}

export async function createContact(p: ContactParams): Promise<number> {
  const res = await biznet.post<BiznetResponse<number>>("/Clients/AddCustomer", {
    ...contactBody(0, p),
    presetId: 0,
    fillTabs: false,
  });
  return unwrap(res);
}

export async function updateContact(id: number, p: ContactParams): Promise<number> {
  const res = await biznet.post<BiznetResponse<number>>(
    "/Clients/UpdateCustomer",
    contactBody(id, p)
  );
  return unwrap(res);
}

export interface ContactNoteOptions {
  type?: string;
  customerName?: string;
  phone?: string;
}

// Notes are stored as call-log entries — SaveCallLog returns an empty body, not BiznetResponse
export async function addContactNote(
  contactId: number,
  note: string,
  opts: ContactNoteOptions = {}
): Promise<void> {
  const now = new Date();
  const date = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${now.getFullYear()}`;
  const time = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  await biznet.post<unknown>("/Clients/SaveCallLog", {
    callLogId: 0,
    caseId: 0,
    customerId: contactId,
    customerName: opts.customerName ?? "",
    date,
    time,
    duration: "00:00",
    phone: opts.phone ?? "",
    type: opts.type ?? "External Call",
    user: "",
    notes: note,
  });
}

// ─── Organizations ───────────────────────────────────────────────────────────

export function listOrganizations(): Promise<IdNameItem[]> {
  return biznet.get<IdNameItem[]>("/Clients/GetOrganisationList");
}

export function listOrganizationTypes(): Promise<string[]> {
  return biznet.get<string[]>("/Clients/GetOrganisationObjectTypes");
}

export interface OrganizationParams {
  type: string;
  name: string;
  country?: string;
  city?: string;
  address?: string;
  postCode?: string;
  phone?: string;
  email?: string;
  url?: string;
  reference?: string;
  orgType?: string;
  user?: string;
  notes?: string;
  action?: string;
}

/** Create (id=0) or update (id>0) an organization. */
export async function saveOrganization(id: number, p: OrganizationParams): Promise<number> {
  const res = await biznet.post<BiznetResponse<number>>("/Clients/SaveCompany", {
    id,
    type: p.type,
    name: p.name,
    country: p.country ?? "",
    city: p.city ?? "",
    address: p.address ?? "",
    postCode: p.postCode ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    url: p.url ?? "",
    reference: p.reference ?? "",
    orgType: p.orgType ?? "",
    user: p.user ?? "",
    notes: p.notes ?? "",
    action: p.action ?? "",
  });
  return unwrap(res);
}

export async function linkObjects(
  fromId: number,
  toId: number,
  relation?: string
): Promise<unknown> {
  const res = await biznet.post<BiznetResponse<unknown>>("/Clients/LinkObject", {
    id: fromId,
    linkedId: toId,
    relation: relation ?? "",
  });
  return unwrap(res);
}

export function getDepartments(orgId: number | string): Promise<unknown[]> {
  return biznet.get<unknown[]>("/Clients/GetDepartmentList", { orgId });
}

// ─── Cases ───────────────────────────────────────────────────────────────────

export function listCasesForContact(rootId: number | string): Promise<CaseItem[]> {
  return biznet.get<CaseItem[]>("/Clients/GetCustomerCaseList", { rootId });
}

export function listCaseTypes(): Promise<MatterItem[]> {
  return biznet.get<MatterItem[]>("/Worktypes/GetMatterList");
}

export function listWorkflows(matter: string): Promise<string[]> {
  return biznet.get<string[]>("/Workflow/GetMasterWorkflowList", { matter });
}

export function getCaseEvents(caseId: number | string): Promise<unknown[]> {
  return biznet.get<unknown[]>("/Events/GetEventsList", { caseId });
}

export interface CreateCaseParams {
  matterName: string;
  rootId: number;
  workflow: string;
  manager: string;
  user: string;
  caseName: string;
  caseRef?: string;
  caseNotes?: string;
  due?: string;
  isPublic?: boolean;
  extraClient?: number;
}

/** Three-step case creation: assign matter → create → set permissions. Returns case ID. */
export async function createCase(p: CreateCaseParams): Promise<number> {
  const assignRes = await biznet.post<BiznetResponse<unknown>>(
    `/Worktypes/AssignMatterType/?matterName=${encodeURIComponent(p.matterName)}&rootId=${p.rootId}`,
    {}
  );
  if (!assignRes.Status) {
    throw new BiznetApiError(`Error assigning matter type: ${assignRes.Message}`);
  }

  const createRes = await biznet.post<BiznetResponse<number>>("/Case/CreateCase", {
    matterName: p.matterName,
    workflow: p.workflow,
    manager: p.manager,
    user: p.user,
    caseRef: p.caseRef ?? "",
    caseNotes: p.caseNotes ?? "",
    due: p.due ?? "",
    rootId: p.rootId,
    isPublic: p.isPublic ?? true,
    extraClient: p.extraClient ?? 0,
    extraName: "Partner",
    caseName: p.caseName,
  });
  const caseId = unwrap(createRes);

  // Non-fatal if permissions call fails
  await biznet
    .post<BiznetResponse<unknown>>(`/Case/SetCaseDefaultPermissions?caseId=${caseId}`, {})
    .catch(() => null);

  return caseId;
}

// ─── Object types ────────────────────────────────────────────────────────────

export function listObjectTypes(): Promise<Array<{ Name: string; Type: string }>> {
  return biznet.get<Array<{ Name: string; Type: string }>>("/Painter/GetRegularCustomTypes");
}

export function getTypeFields(objectType: string): Promise<ObjectTypeInfo> {
  return biznet.get<ObjectTypeInfo>("/Painter/LoadTypeData", { objectType });
}

export async function createObjectType(
  name: string,
  regular: boolean = true,
  baseType: string = ""
): Promise<unknown> {
  const res = await biznet.post<BiznetResponse<unknown>>("/Painter/CreateType/", {
    name,
    regular,
    baseType,
  });
  return unwrap(res);
}

export function getBaseTypes(): Promise<string[]> {
  return biznet.get<string[]>("/Painter/GetBaseTypes");
}

/** Set a single field on any object (contact, org, custom). The only reliable
 * way to save address fields — /Clients/SetAddressInfo silently fails. */
export async function updateFieldValue(
  objectId: number,
  fieldName: string,
  value: string
): Promise<void> {
  await biznet.post<unknown>("/Painter/UpdateFieldValue/", { objectId, fieldName, value });
}

// ─── Input forms ─────────────────────────────────────────────────────────────

export function listInputForms(type?: string): Promise<unknown[]> {
  const params: Record<string, string> = {};
  if (type) params.type = type;
  return biznet.get<unknown[]>("/InputForm/GetTypedInputFormList", params);
}

export function getInputForm(id: number | string): Promise<unknown> {
  return biznet.get<unknown>("/InputForm/GetFormDetails", { id });
}

export async function createInputForm(
  title: string,
  objectType?: string,
  group?: string
): Promise<number> {
  const res = await biznet.post<BiznetResponse<number>>("/InputForm/CreateNewForm", {
    title,
    type: objectType ?? "",
    group: group ?? "",
  });
  return unwrap(res);
}

export interface FormFieldParams {
  formId: number;
  fieldName: string;
  fieldType: string;
  required?: boolean;
  defaultValue?: string;
  options?: string;
}

export async function addFormField(p: FormFieldParams): Promise<unknown> {
  const res = await biznet.post<BiznetResponse<unknown>>("/InputForm/SaveFormField", {
    formId: p.formId,
    name: p.fieldName,
    type: p.fieldType,
    required: p.required ?? false,
    defaultValue: p.defaultValue ?? "",
    options: p.options ?? "",
  });
  return unwrap(res);
}

// ─── Users & lookups ─────────────────────────────────────────────────────────

export function listUsers(): Promise<NameValueItem[]> {
  return biznet.get<NameValueItem[]>("/Config/GetUserListNameValueList");
}

export function getLookupList(category: string, sort: boolean = false): Promise<NameValueItem[]> {
  return biznet.get<NameValueItem[]>("/Config/GetLookupList", { category, sort });
}
