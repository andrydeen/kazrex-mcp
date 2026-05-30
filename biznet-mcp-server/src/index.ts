import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
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

const server = new McpServer({
  name: "biznet-mcp-server",
  version: "1.0.0",
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function handleApiResponse(res: BiznetResponse<unknown>, successMsg?: string): ReturnType<typeof ok> {
  if (!res.Status) {
    return ok(`Error: ${res.Message || "Unknown error from CRM"}`);
  }
  const msg = successMsg ?? `Success. Result: ${JSON.stringify(res.Argument)}`;
  return ok(msg);
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────

server.registerTool(
  "biznet_list_contacts",
  {
    title: "List Contacts",
    description: `List all contacts (people) in the CRM.
Returns an array of {Id, Name} items. Note: returns ALL contacts — can be large on busy CRMs.
Use biznet_get_contact to fetch full details for a specific contact.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await biznet.get<IdNameItem[]>("/Clients/GetPrimaryList");
    if (!Array.isArray(data) || data.length === 0) return ok("No contacts found.");
    const lines = data.map((c) => `ID: ${c.Id} | Name: ${c.Name}`).join("\n");
    return ok(`Found ${data.length} contacts:\n\n${lines}`);
  }
);

server.registerTool(
  "biznet_get_contact",
  {
    title: "Get Contact Details",
    description: `Get full details for a single contact by their ID.
Returns all fields: name, phone, email, address, organisation, type, status, social networks, etc.`,
    inputSchema: z.object({
      id: z.number().int().positive().describe("Contact ID (from biznet_list_contacts)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ id }) => {
    const data = await biznet.get<ContactDetail>("/Clients/GetCustomerDetails", { id });
    return ok(JSON.stringify(data, null, 2));
  }
);

server.registerTool(
  "biznet_search_contact_by_phone",
  {
    title: "Search Contact by Phone",
    description: `Find contacts matching a phone number (full or partial).
Returns list of matching contacts with ID and Name.`,
    inputSchema: z.object({
      phone: z.string().min(3).describe("Phone number to search for (e.g. '+44 7700 900000' or '07700')"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ phone }) => {
    const data = await biznet.get<IdNameItem[]>("/Clients/GetCustomerLookupByPhone", { phone });
    if (!Array.isArray(data) || data.length === 0) return ok(`No contacts found for phone: ${phone}`);
    const lines = data.map((c) => `ID: ${c.Id} | Name: ${c.Name}`).join("\n");
    return ok(`Found ${data.length} match(es):\n\n${lines}`);
  }
);

server.registerTool(
  "biznet_create_contact",
  {
    title: "Create New Contact",
    description: `Create a new contact (individual person) in the CRM.
The 'type' field must be one of the contact types returned by biznet_list_contact_types.
Returns the new contact's ID on success.

Args:
  - type (required): Contact type name (e.g. "Primary")
  - lname (required): Last name
  - fname: First name
  - title: Salutation (Mr, Mrs, Miss, Dr, etc.)
  - phone: Phone number
  - mobilephone: Mobile/cell number
  - email: Email address
  - fax: Fax number
  - organisation: Organisation ID (from biznet_list_organizations) — 0 if none
  - department: Department ID — 0 if none
  - position: Job title/position
  - clientRef: Client reference code
  - clientStatus: Status value (from biznet_get_lookup_list category=PrimaryStatus)
  - birthday: Birth date (DD/MM/YYYY format)
  - marital: Marital status (Single, Married, Divorced, Widowed)
  - facebook / instagram / twitter / linkedin: Social network URLs`,
    inputSchema: z.object({
      type: z.string().min(1).describe("Contact type name — required. Use biznet_list_contact_types to get valid values."),
      lname: z.string().min(1).describe("Last name — required"),
      fname: z.string().optional().describe("First name"),
      title: z.string().optional().describe("Title/salutation (Mr, Mrs, Miss, Dr, etc.)"),
      phone: z.string().optional().describe("Phone number"),
      mobilephone: z.string().optional().describe("Mobile phone number"),
      email: z.string().optional().describe("Email address"),
      fax: z.string().optional().describe("Fax number"),
      organisation: z.number().int().optional().default(0).describe("Organisation ID (0 = none)"),
      department: z.number().int().optional().default(0).describe("Department ID (0 = none)"),
      position: z.string().optional().describe("Job position/title"),
      clientRef: z.string().optional().describe("Client reference code"),
      clientStatus: z.string().optional().describe("Status value from lookup list"),
      birthday: z.string().optional().describe("Birth date in DD/MM/YYYY format"),
      marital: z.enum(["", "Single", "Married", "Divorced", "Widowed"]).optional().describe("Marital status"),
      facebook: z.string().optional(),
      instagram: z.string().optional(),
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async (params) => {
    const body: Record<string, unknown> = {
      id: 0,
      type: params.type,
      lname: params.lname,
      fname: params.fname ?? "",
      title: params.title ?? "",
      phone: params.phone ?? "",
      mobilephone: params.mobilephone ?? "",
      email: params.email ?? "",
      fax: params.fax ?? "",
      organisation: params.organisation ?? 0,
      department: params.department ?? 0,
      position: params.position ?? "",
      clientRef: params.clientRef ?? "",
      clientStatus: params.clientStatus ?? "",
      birthday: params.birthday ?? "",
      marital: params.marital ?? "",
      facebook: params.facebook ?? "",
      instagram: params.instagram ?? "",
      twitter: params.twitter ?? "",
      linkedin: params.linkedin ?? "",
      presetId: 0,
      fillTabs: false,
    };
    const res = await biznet.post<BiznetResponse<number>>("/Clients/AddCustomer", body);
    return handleApiResponse(res, `Contact created successfully. New contact ID: ${res.Argument}`);
  }
);

server.registerTool(
  "biznet_update_contact",
  {
    title: "Update Contact",
    description: `Update an existing contact's details. Only fields you provide will be changed — fetch the current data with biznet_get_contact first if you want to preserve existing values.
Returns the contact ID on success.`,
    inputSchema: z.object({
      id: z.number().int().positive().describe("Contact ID to update"),
      type: z.string().min(1).describe("Contact type name (cannot be changed after creation, but must still be sent)"),
      lname: z.string().min(1).describe("Last name"),
      fname: z.string().optional(),
      title: z.string().optional(),
      phone: z.string().optional(),
      mobilephone: z.string().optional(),
      email: z.string().optional(),
      fax: z.string().optional(),
      organisation: z.number().int().optional().default(0),
      department: z.number().int().optional().default(0),
      position: z.string().optional(),
      clientRef: z.string().optional(),
      clientStatus: z.string().optional(),
      birthday: z.string().optional(),
      marital: z.enum(["", "Single", "Married", "Divorced", "Widowed"]).optional(),
      facebook: z.string().optional(),
      instagram: z.string().optional(),
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    const body: Record<string, unknown> = {
      id: params.id,
      type: params.type,
      lname: params.lname,
      fname: params.fname ?? "",
      title: params.title ?? "",
      phone: params.phone ?? "",
      mobilephone: params.mobilephone ?? "",
      email: params.email ?? "",
      fax: params.fax ?? "",
      organisation: params.organisation ?? 0,
      department: params.department ?? 0,
      position: params.position ?? "",
      clientRef: params.clientRef ?? "",
      clientStatus: params.clientStatus ?? "",
      birthday: params.birthday ?? "",
      marital: params.marital ?? "",
      facebook: params.facebook ?? "",
      instagram: params.instagram ?? "",
      twitter: params.twitter ?? "",
      linkedin: params.linkedin ?? "",
    };
    const res = await biznet.post<BiznetResponse<number>>("/Clients/UpdateCustomer", body);
    return handleApiResponse(res, `Contact ID ${params.id} updated successfully.`);
  }
);

server.registerTool(
  "biznet_list_contact_types",
  {
    title: "List Contact Types",
    description: `List all available contact type names. Use these values for the 'type' field when creating contacts.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await biznet.get<string[]>("/Clients/GetPrimaryObjectTypes");
    if (!Array.isArray(data) || data.length === 0) return ok("No contact types found.");
    return ok(`Available contact types:\n${data.map((t) => `- ${t}`).join("\n")}`);
  }
);

server.registerTool(
  "biznet_add_contact_note",
  {
    title: "Add Note to Contact",
    description: `Add a text note to a contact's record.`,
    inputSchema: z.object({
      contactId: z.number().int().positive().describe("Contact ID"),
      note: z.string().min(1).describe("Note text to add"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ contactId, note }) => {
    const res = await biznet.post<BiznetResponse<unknown>>("/Clients/AddCustomerNote", {
      id: contactId,
      note,
    });
    return handleApiResponse(res, `Note added to contact ID ${contactId}.`);
  }
);

// ─── ORGANIZATIONS ────────────────────────────────────────────────────────────

server.registerTool(
  "biznet_list_organizations",
  {
    title: "List Organizations",
    description: `List all organizations in the CRM.
Returns array of {Id, Name}.
Use biznet_get_organization_types to get valid type values before creating.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await biznet.get<IdNameItem[]>("/Clients/GetOrganisationList");
    if (!Array.isArray(data) || data.length === 0) return ok("No organizations found.");
    const lines = data.map((o) => `ID: ${o.Id} | Name: ${o.Name}`).join("\n");
    return ok(`Found ${data.length} organizations:\n\n${lines}`);
  }
);

server.registerTool(
  "biznet_list_organization_types",
  {
    title: "List Organization Types",
    description: `List available organization type names. Use these for the 'type' field when creating organizations.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await biznet.get<string[]>("/Clients/GetOrganisationObjectTypes");
    if (!Array.isArray(data) || data.length === 0) return ok("No organization types found.");
    return ok(`Available organization types:\n${data.map((t) => `- ${t}`).join("\n")}`);
  }
);

server.registerTool(
  "biznet_create_organization",
  {
    title: "Create New Organization",
    description: `Create a new organization in the CRM.
The 'type' field must be a value from biznet_list_organization_types.
Returns the new organization's ID on success.

Args:
  - type (required): Organization type (from biznet_list_organization_types)
  - name (required): Organization name
  - country: Country
  - city: City
  - address: Street address
  - postCode: Postal/ZIP code
  - phone: Phone number
  - email: Email address
  - url: Website URL
  - reference: Client reference code
  - orgType: Category (from biznet_get_lookup_list category=OrgType, e.g. "supplier")
  - user: Assigned user ID (from biznet_list_users)
  - notes: Free text notes
  - action: Next action (from biznet_get_lookup_list category=CustomAction)`,
    inputSchema: z.object({
      type: z.string().min(1).describe("Organization type name — required. Use biznet_list_organization_types."),
      name: z.string().min(1).describe("Organization name — required"),
      country: z.string().optional(),
      city: z.string().optional(),
      address: z.string().optional(),
      postCode: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      url: z.string().optional(),
      reference: z.string().optional(),
      orgType: z.string().optional().describe("Category (e.g. supplier). Use biznet_get_lookup_list category=OrgType"),
      user: z.string().optional().describe("Assigned user ID or name"),
      notes: z.string().optional(),
      action: z.string().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async (params) => {
    const body: Record<string, unknown> = {
      id: 0,
      type: params.type,
      name: params.name,
      country: params.country ?? "",
      city: params.city ?? "",
      address: params.address ?? "",
      postCode: params.postCode ?? "",
      phone: params.phone ?? "",
      email: params.email ?? "",
      url: params.url ?? "",
      reference: params.reference ?? "",
      orgType: params.orgType ?? "",
      user: params.user ?? "",
      notes: params.notes ?? "",
      action: params.action ?? "",
    };
    const res = await biznet.post<BiznetResponse<number>>("/Clients/SaveCompany", body);
    return handleApiResponse(res, `Organization created successfully. New organization ID: ${res.Argument}`);
  }
);

server.registerTool(
  "biznet_update_organization",
  {
    title: "Update Organization",
    description: `Update an existing organization's details. Provide the organization's ID along with the fields to update.`,
    inputSchema: z.object({
      id: z.number().int().positive().describe("Organization ID to update"),
      type: z.string().min(1).describe("Organization type name (must be provided)"),
      name: z.string().min(1).describe("Organization name"),
      country: z.string().optional(),
      city: z.string().optional(),
      address: z.string().optional(),
      postCode: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      url: z.string().optional(),
      reference: z.string().optional(),
      orgType: z.string().optional(),
      user: z.string().optional(),
      notes: z.string().optional(),
      action: z.string().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    const body: Record<string, unknown> = {
      id: params.id,
      type: params.type,
      name: params.name,
      country: params.country ?? "",
      city: params.city ?? "",
      address: params.address ?? "",
      postCode: params.postCode ?? "",
      phone: params.phone ?? "",
      email: params.email ?? "",
      url: params.url ?? "",
      reference: params.reference ?? "",
      orgType: params.orgType ?? "",
      user: params.user ?? "",
      notes: params.notes ?? "",
      action: params.action ?? "",
    };
    const res = await biznet.post<BiznetResponse<number>>("/Clients/SaveCompany", body);
    return handleApiResponse(res, `Organization ID ${params.id} updated successfully.`);
  }
);

server.registerTool(
  "biznet_link_objects",
  {
    title: "Link Two Objects",
    description: `Create a relationship link between two CRM objects (e.g. link a contact to an organization, or a contact to a case).`,
    inputSchema: z.object({
      fromId: z.number().int().positive().describe("Source object ID"),
      toId: z.number().int().positive().describe("Target object ID to link to"),
      relation: z.string().optional().describe("Optional relationship label"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ fromId, toId, relation }) => {
    const res = await biznet.post<BiznetResponse<unknown>>("/Clients/LinkObject", {
      id: fromId,
      linkedId: toId,
      relation: relation ?? "",
    });
    return handleApiResponse(res, `Objects ${fromId} and ${toId} linked successfully.`);
  }
);

// ─── CASES ────────────────────────────────────────────────────────────────────

server.registerTool(
  "biznet_list_cases_for_contact",
  {
    title: "List Cases for Contact",
    description: `List all cases associated with a specific contact or organization.
Returns cases with their ID, name, workflow, user, manager, and reference.`,
    inputSchema: z.object({
      contactId: z.number().int().positive().describe("Contact or organization ID"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ contactId }) => {
    const data = await biznet.get<CaseItem[]>("/Clients/GetCustomerCaseList", { rootId: contactId });
    if (!Array.isArray(data) || data.length === 0) return ok(`No cases found for contact ID ${contactId}.`);
    const lines = data
      .map((c) => `ID: ${c.Id} | Name: ${c.Name}${c.Reference ? ` | Ref: ${c.Reference}` : ""}`)
      .join("\n");
    return ok(`Found ${data.length} cases for contact ${contactId}:\n\n${lines}`);
  }
);

server.registerTool(
  "biznet_list_case_types",
  {
    title: "List Case Types (Work Types / Matters)",
    description: `List all available case types (also called work types or matters).
Returns {Id, Name} for each type. Use the Id as 'matterName' when creating a case.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await biznet.get<MatterItem[]>("/Worktypes/GetMatterList");
    if (!Array.isArray(data) || data.length === 0) return ok("No case types defined.");
    const lines = data.map((m) => `ID: ${m.Id} | Name: ${m.Name}`).join("\n");
    return ok(`Available case types:\n\n${lines}`);
  }
);

server.registerTool(
  "biznet_list_workflows",
  {
    title: "List Workflows for Case Type",
    description: `List all workflows available for a specific case type (matter/work type).
Returns workflow names. Use one of these as the 'workflow' field when creating a case.`,
    inputSchema: z.object({
      matterName: z.string().min(1).describe("Case type name or ID (from biznet_list_case_types)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ matterName }) => {
    const data = await biznet.get<string[]>("/Workflow/GetMasterWorkflowList", { matter: matterName });
    if (!Array.isArray(data) || data.length === 0) return ok(`No workflows found for matter type: ${matterName}`);
    return ok(`Workflows for '${matterName}':\n${data.map((w) => `- ${w}`).join("\n")}`);
  }
);

server.registerTool(
  "biznet_create_case",
  {
    title: "Create New Case",
    description: `Create a new case in the CRM. This is a multi-step operation:
1. Assigns the matter type to the client
2. Creates the case with the specified workflow
3. Sets default permissions

Required: matterName, rootId, workflow, manager, user, caseName.
Use biznet_list_case_types to get matterName values.
Use biznet_list_workflows to get workflow values for a given matter.
Use biznet_list_users to get manager and user values.

Returns the new case ID on success.`,
    inputSchema: z.object({
      matterName: z.string().min(1).describe("Case type name/ID from biznet_list_case_types"),
      rootId: z.number().int().positive().describe("Contact or organization ID this case belongs to"),
      workflow: z.string().min(1).describe("Workflow name from biznet_list_workflows"),
      manager: z.string().min(1).describe("Manager username/ID from biznet_list_users"),
      user: z.string().min(1).describe("Assigned user username/ID from biznet_list_users"),
      caseName: z.string().min(1).describe("Display name for the case"),
      caseRef: z.string().optional().describe("Case reference number/code"),
      caseNotes: z.string().optional().describe("Initial notes for the case"),
      due: z.string().optional().describe("Due date in DD/MM/YYYY format"),
      isPublic: z.boolean().optional().default(true).describe("Whether all users can see this case (default: true)"),
      extraClient: z.number().int().optional().default(0).describe("Additional client/contact ID to associate (0 = none)"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async (params) => {
    // Step 1: Assign matter type to client
    const assignRes = await biznet.post<BiznetResponse<unknown>>(
      `/Worktypes/AssignMatterType/?matterName=${encodeURIComponent(params.matterName)}&rootId=${params.rootId}`,
      {}
    );
    if (!assignRes.Status) {
      return ok(`Error assigning matter type: ${assignRes.Message}`);
    }

    // Step 2: Create the case
    const createRes = await biznet.post<BiznetResponse<number>>("/Case/CreateCase", {
      matterName: params.matterName,
      workflow: params.workflow,
      manager: params.manager,
      user: params.user,
      caseRef: params.caseRef ?? "",
      caseNotes: params.caseNotes ?? "",
      due: params.due ?? "",
      rootId: params.rootId,
      isPublic: params.isPublic ?? true,
      extraClient: params.extraClient ?? 0,
      extraName: "Partner",
      caseName: params.caseName,
    });

    if (!createRes.Status) {
      return ok(`Error creating case: ${createRes.Message}`);
    }

    const caseId = createRes.Argument;

    // Step 3: Set default permissions
    await biznet.post<BiznetResponse<unknown>>(
      `/Case/SetCaseDefaultPermissions?caseId=${caseId}`,
      {}
    ).catch(() => null); // Non-fatal if this fails

    return ok(`Case created successfully.\nCase ID: ${caseId}\nCase Name: ${params.caseName}`);
  }
);

server.registerTool(
  "biznet_get_case_events",
  {
    title: "Get Case Events / Tasks",
    description: `List all tasks/events for a specific case.
Returns event details including title, status, due date, assigned user, and result.`,
    inputSchema: z.object({
      caseId: z.number().int().positive().describe("Case ID"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ caseId }) => {
    const data = await biznet.get<unknown[]>("/Events/GetEventsList", { caseId });
    if (!Array.isArray(data) || data.length === 0) return ok(`No events found for case ID ${caseId}.`);
    return ok(`Case ${caseId} has ${data.length} event(s):\n\n${JSON.stringify(data, null, 2)}`);
  }
);

// ─── OBJECT TYPES ─────────────────────────────────────────────────────────────

server.registerTool(
  "biznet_list_object_types",
  {
    title: "List Object Types",
    description: `List all custom object types defined in the system (from the Painter/Builder).
Returns type names. Use biznet_get_type_fields to inspect a type's fields.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await biznet.get<Array<{ Name: string; Type: string }>>(
      "/Painter/GetRegularCustomTypes"
    );
    if (!Array.isArray(data) || data.length === 0) return ok("No custom object types defined.");
    const lines = data.map((t) => `Name: ${t.Name} | Type: ${t.Type}`).join("\n");
    return ok(`Custom object types:\n\n${lines}`);
  }
);

server.registerTool(
  "biznet_get_type_fields",
  {
    title: "Get Fields for Object Type",
    description: `Get the field definitions for a specific object type.
Returns field names, types (text/number/bool/date/flag), and display modes.
Use this before creating objects of a custom type to know what fields are available.`,
    inputSchema: z.object({
      objectType: z.string().min(1).describe("Object type name (from biznet_list_object_types)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ objectType }) => {
    const data = await biznet.get<ObjectTypeInfo>("/Painter/LoadTypeData", { objectType });
    return ok(JSON.stringify(data, null, 2));
  }
);

server.registerTool(
  "biznet_create_object_type",
  {
    title: "Create New Object Type",
    description: `Create a new custom object type in the CRM's data model.
Type names must contain only letters, numbers, and underscores (no spaces).
Use 'regular: true' for standard data types. Set baseType to extend an existing type, or leave empty for a fresh type.

After creating, use biznet_get_type_fields to inspect the new type's fields. Adding custom fields to a type is managed in the CRM Painter/Builder UI and is not yet exposed by this server.`,
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .regex(/^\w+$/, "Only letters, numbers, and underscores allowed — no spaces")
        .describe("Type name (letters/numbers/underscore only, no spaces)"),
      regular: z.boolean().optional().default(true).describe("true = Regular Type, false = Smart Type"),
      baseType: z.string().optional().default("").describe("Base type to extend (empty for a fresh type)"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ name, regular, baseType }) => {
    const res = await biznet.post<BiznetResponse<unknown>>("/Painter/CreateType/", {
      name,
      regular: regular ?? true,
      baseType: baseType ?? "",
    });
    return handleApiResponse(res, `Object type '${name}' created successfully.`);
  }
);

server.registerTool(
  "biznet_get_base_types",
  {
    title: "List Base Types for New Object Type",
    description: `List available base types that can be used when creating a new object type.
These are the parent types a new custom type can extend.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await biznet.get<string[]>("/Painter/GetBaseTypes");
    if (!Array.isArray(data) || data.length === 0) return ok("No base types available.");
    return ok(`Available base types:\n${data.map((t) => `- ${t}`).join("\n")}`);
  }
);

// ─── INPUT FORMS ──────────────────────────────────────────────────────────────

server.registerTool(
  "biznet_list_input_forms",
  {
    title: "List Input Forms",
    description: `List all input forms defined in the system.
Input forms are data-entry templates attached to cases or workflow steps.
Returns form details including ID, title, and associated type.`,
    inputSchema: z.object({
      type: z.string().optional().describe("Filter by object type name (optional — leave empty to list all)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ type }) => {
    const params: Record<string, string> = {};
    if (type) params.type = type;
    const data = await biznet.get<unknown[]>("/InputForm/GetTypedInputFormList", params);
    if (!Array.isArray(data) || data.length === 0) return ok("No input forms found.");
    return ok(`Input forms (${data.length}):\n\n${JSON.stringify(data, null, 2)}`);
  }
);

server.registerTool(
  "biznet_get_input_form",
  {
    title: "Get Input Form Details",
    description: `Get the full definition of a specific input form including all its fields.`,
    inputSchema: z.object({
      formId: z.number().int().positive().describe("Input form ID"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ formId }) => {
    const data = await biznet.get<unknown>("/InputForm/GetFormDetails", { id: formId });
    return ok(JSON.stringify(data, null, 2));
  }
);

server.registerTool(
  "biznet_create_input_form",
  {
    title: "Create New Input Form",
    description: `Create a new input form in the system.
Input forms are data-entry templates used in workflows and case tabs.
After creating, use biznet_add_form_field to add fields to the form.
Returns the new form's ID on success.`,
    inputSchema: z.object({
      title: z.string().min(1).describe("Form title/name"),
      objectType: z.string().optional().describe("Object type this form is for (leave empty for general form)"),
      group: z.string().optional().describe("Group/category for organizing forms"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ title, objectType, group }) => {
    const res = await biznet.post<BiznetResponse<number>>("/InputForm/CreateNewForm", {
      title,
      type: objectType ?? "",
      group: group ?? "",
    });
    return handleApiResponse(res, `Input form '${title}' created. Form ID: ${res.Argument}`);
  }
);

server.registerTool(
  "biznet_add_form_field",
  {
    title: "Add Field to Input Form",
    description: `Add a new field to an existing input form.
Field types: text, number, bool, date, flag, reference, multiline, dropdown.
Use biznet_get_input_form to see existing fields before adding.`,
    inputSchema: z.object({
      formId: z.number().int().positive().describe("Input form ID (from biznet_create_input_form or biznet_list_input_forms)"),
      fieldName: z.string().min(1).describe("Field name/label displayed to the user"),
      fieldType: z
        .enum(["text", "number", "bool", "date", "flag", "reference", "multiline", "dropdown"])
        .describe("Field data type"),
      required: z.boolean().optional().default(false).describe("Whether the field is mandatory"),
      defaultValue: z.string().optional().describe("Default value for the field"),
      options: z.string().optional().describe("For dropdown fields: comma-separated list of options"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ formId, fieldName, fieldType, required, defaultValue, options }) => {
    const res = await biznet.post<BiznetResponse<unknown>>("/InputForm/SaveFormField", {
      formId,
      name: fieldName,
      type: fieldType,
      required: required ?? false,
      defaultValue: defaultValue ?? "",
      options: options ?? "",
    });
    return handleApiResponse(res, `Field '${fieldName}' added to form ID ${formId}.`);
  }
);

// ─── USERS & LOOKUPS ──────────────────────────────────────────────────────────

server.registerTool(
  "biznet_list_users",
  {
    title: "List Users",
    description: `List all CRM users with their Name and Value (ID/username).
Use these values for the 'manager' and 'user' fields when creating cases,
or for 'user' fields when creating organizations.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await biznet.get<NameValueItem[]>("/Config/GetUserListNameValueList");
    if (!Array.isArray(data) || data.length === 0) return ok("No users found.");
    const lines = data.map((u) => `Name: ${u.Name} | Value: ${u.Value}`).join("\n");
    return ok(`Users (${data.length}):\n\n${lines}`);
  }
);

server.registerTool(
  "biznet_get_lookup_list",
  {
    title: "Get Lookup List",
    description: `Get predefined lookup values for a given category.
Use these to populate dropdown fields throughout the CRM.

Common categories:
  - PrimaryStatus     — Contact/lead status values
  - OrgType           — Organization category types
  - CustomAction      — Next action options
  - CallLogTypes      — Types of call log entries
  - RecordActivity    — Activity types for records

Returns {Name, Value} pairs.`,
    inputSchema: z.object({
      category: z
        .string()
        .min(1)
        .describe(
          "Lookup category (e.g. PrimaryStatus, OrgType, CustomAction, CallLogTypes, RecordActivity)"
        ),
      sort: z.boolean().optional().default(false).describe("Sort results alphabetically"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ category, sort }) => {
    const data = await biznet.get<NameValueItem[]>("/Config/GetLookupList", { category, sort: sort ?? false });
    if (!Array.isArray(data) || data.length === 0) return ok(`No values found for category: ${category}`);
    const lines = data.map((i) => `Name: ${i.Name} | Value: ${i.Value}`).join("\n");
    return ok(`Lookup values for '${category}' (${data.length}):\n\n${lines}`);
  }
);

server.registerTool(
  "biznet_get_departments",
  {
    title: "Get Departments for Organization",
    description: `List departments within a specific organization.
Returns {Id, Name, Ref, Phone, Notes} for each department.`,
    inputSchema: z.object({
      organizationId: z.number().int().positive().describe("Organization ID"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ organizationId }) => {
    const data = await biznet.get<unknown[]>("/Clients/GetDepartmentList", { orgId: organizationId });
    if (!Array.isArray(data) || data.length === 0) return ok(`No departments found for organization ${organizationId}.`);
    return ok(`Departments for organization ${organizationId}:\n\n${JSON.stringify(data, null, 2)}`);
  }
);

// ─── SERVER STARTUP ───────────────────────────────────────────────────────────

async function startHttp(port: number) {
  const app = express();
  app.use(express.json());

  // Optional Bearer token auth — set MCP_API_KEY on Railway to enable
  const API_KEY = process.env.MCP_API_KEY;
  app.use((req, res, next) => {
    if (!API_KEY || req.path === "/health") return next();
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${API_KEY}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => res.send("OK"));

  // ─── REST API (for Hermes and other HTTP clients) ─────────────────────────

  app.get("/api/contacts", async (_req, res) => {
    try {
      const data = await biznet.get<IdNameItem[]>("/Clients/GetPrimaryList");
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/contacts/:id", async (req, res) => {
    try {
      const data = await biznet.get<ContactDetail>("/Clients/GetCustomerDetails", { id: req.params.id });
      res.json({ ok: true, data });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post("/api/contacts/search/phone", async (req, res) => {
    try {
      const { phone } = req.body as { phone: string };
      const data = await biznet.get<IdNameItem[]>("/Clients/GetPrimaryList", { phone });
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const b = req.body as Record<string, unknown>;
      const body = {
        id: 0,
        type: b.type ?? "",
        lname: b.lname ?? "",
        fname: b.fname ?? "",
        title: b.title ?? "",
        phone: b.phone ?? "",
        mobilephone: b.mobilephone ?? "",
        email: b.email ?? "",
        fax: b.fax ?? "",
        organisation: b.organisation ?? 0,
        department: b.department ?? 0,
        position: b.position ?? "",
        clientRef: b.clientRef ?? "",
        clientStatus: b.clientStatus ?? "",
        birthday: b.birthday ?? "",
        marital: b.marital ?? "",
        facebook: b.facebook ?? "",
        instagram: b.instagram ?? "",
        twitter: b.twitter ?? "",
        linkedin: b.linkedin ?? "",
        presetId: 0,
        fillTabs: false,
      };
      const data = await biznet.post<BiznetResponse<number>>("/Clients/AddCustomer", body);
      res.json({ ok: data.Status, data: data.Argument, message: data.Message });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const b = req.body as Record<string, unknown>;
      const body = {
        id: Number(req.params.id),
        type: b.type ?? "",
        lname: b.lname ?? "",
        fname: b.fname ?? "",
        title: b.title ?? "",
        phone: b.phone ?? "",
        mobilephone: b.mobilephone ?? "",
        email: b.email ?? "",
        fax: b.fax ?? "",
        organisation: b.organisation ?? 0,
        department: b.department ?? 0,
        position: b.position ?? "",
        clientRef: b.clientRef ?? "",
        clientStatus: b.clientStatus ?? "",
        birthday: b.birthday ?? "",
        marital: b.marital ?? "",
        facebook: b.facebook ?? "",
        instagram: b.instagram ?? "",
        twitter: b.twitter ?? "",
        linkedin: b.linkedin ?? "",
      };
      const data = await biznet.post<BiznetResponse<number>>("/Clients/UpdateCustomer", body);
      res.json({ ok: data.Status, data: data.Argument, message: data.Message });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post("/api/contacts/:id/notes", async (req, res) => {
    try {
      const { note } = req.body as { note: string };
      const data = await biznet.post<BiznetResponse<unknown>>("/Clients/AddCustomerNote", { id: req.params.id, note });
      res.json({ ok: data.Status, data: data.Argument, message: data.Message });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/organizations", async (_req, res) => {
    try {
      const data = await biznet.get<IdNameItem[]>("/Clients/GetOrganisationList");
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post("/api/organizations", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const data = await biznet.post<BiznetResponse<unknown>>("/Clients/CreateOrganisation", body);
      res.json({ ok: data.Status, data: data.Argument, message: data.Message });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/contacts/:id/cases", async (req, res) => {
    try {
      const data = await biznet.get<CaseItem[]>("/Cases/GetCaseList", { clientId: req.params.id });
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/case-types", async (_req, res) => {
    try {
      const data = await biznet.get<MatterItem[]>("/Cases/GetMatterList");
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/users", async (_req, res) => {
    try {
      const data = await biznet.get<NameValueItem[]>("/Admin/GetUserList");
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/lookup/:category", async (req, res) => {
    try {
      const data = await biznet.get<NameValueItem[]>("/Config/GetLookupList", { category: req.params.category });
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/contact-types", async (_req, res) => {
    try {
      const data = await biznet.get<string[]>("/Clients/GetPrimaryObjectTypes");
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/organization-types", async (_req, res) => {
    try {
      const data = await biznet.get<string[]>("/Clients/GetOrganisationObjectTypes");
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.patch("/api/organizations/:id", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const data = await biznet.post<BiznetResponse<number>>("/Clients/SaveCompany", { id: Number(req.params.id), ...body });
      res.json({ ok: data.Status, data: data.Argument, message: data.Message });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post("/api/link-objects", async (req, res) => {
    try {
      const { fromId, toId, relation } = req.body as { fromId: number; toId: number; relation?: string };
      const data = await biznet.post<BiznetResponse<unknown>>("/Clients/LinkObject", { id: fromId, linkedId: toId, relation: relation ?? "" });
      res.json({ ok: data.Status, data: data.Argument, message: data.Message });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/workflows", async (req, res) => {
    try {
      const { matter } = req.query as { matter?: string };
      if (!matter) { res.status(400).json({ ok: false, error: "matter query param required" }); return; }
      const data = await biznet.get<string[]>("/Workflow/GetMasterWorkflowList", { matter });
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post("/api/cases", async (req, res) => {
    try {
      const params = req.body as {
        matterName: string; rootId: number; workflow: string; manager: string;
        user: string; caseName: string; caseRef?: string; caseNotes?: string;
        due?: string; isPublic?: boolean; extraClient?: number;
      };
      const assignRes = await biznet.post<BiznetResponse<unknown>>(
        `/Worktypes/AssignMatterType/?matterName=${encodeURIComponent(params.matterName)}&rootId=${params.rootId}`, {}
      );
      if (!assignRes.Status) { res.status(400).json({ ok: false, message: assignRes.Message }); return; }
      const createRes = await biznet.post<BiznetResponse<number>>("/Case/CreateCase", {
        matterName: params.matterName, workflow: params.workflow, manager: params.manager,
        user: params.user, caseRef: params.caseRef ?? "", caseNotes: params.caseNotes ?? "",
        due: params.due ?? "", rootId: params.rootId, isPublic: params.isPublic ?? true,
        extraClient: params.extraClient ?? 0, extraName: "Partner", caseName: params.caseName,
      });
      if (!createRes.Status) { res.status(400).json({ ok: false, message: createRes.Message }); return; }
      await biznet.post<BiznetResponse<unknown>>(`/Case/SetCaseDefaultPermissions?caseId=${createRes.Argument}`, {}).catch(() => null);
      res.json({ ok: true, data: createRes.Argument, message: `Case created. ID: ${createRes.Argument}` });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/cases/:id/events", async (req, res) => {
    try {
      const data = await biznet.get<unknown[]>("/Events/GetEventsList", { caseId: req.params.id });
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/object-types", async (_req, res) => {
    try {
      const data = await biznet.get<Array<{ Name: string; Type: string }>>("/Painter/GetRegularCustomTypes");
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/object-types/:name/fields", async (req, res) => {
    try {
      const data = await biznet.get<unknown>("/Painter/LoadTypeData", { objectType: req.params.name });
      res.json({ ok: true, data });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post("/api/object-types", async (req, res) => {
    try {
      const { name, regular, baseType } = req.body as { name: string; regular?: boolean; baseType?: string };
      const data = await biznet.post<BiznetResponse<unknown>>("/Painter/CreateType/", { name, regular: regular ?? true, baseType: baseType ?? "" });
      res.json({ ok: data.Status, data: data.Argument, message: data.Message });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/base-types", async (_req, res) => {
    try {
      const data = await biznet.get<string[]>("/Painter/GetBaseTypes");
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/input-forms", async (req, res) => {
    try {
      const params: Record<string, string> = {};
      if (req.query.type) params.type = String(req.query.type);
      const data = await biznet.get<unknown[]>("/InputForm/GetTypedInputFormList", params);
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/input-forms/:id", async (req, res) => {
    try {
      const data = await biznet.get<unknown>("/InputForm/GetFormDetails", { id: req.params.id });
      res.json({ ok: true, data });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post("/api/input-forms", async (req, res) => {
    try {
      const { title, objectType, group } = req.body as { title: string; objectType?: string; group?: string };
      const data = await biznet.post<BiznetResponse<number>>("/InputForm/CreateNewForm", { title, type: objectType ?? "", group: group ?? "" });
      res.json({ ok: data.Status, data: data.Argument, message: data.Message });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post("/api/input-forms/:id/fields", async (req, res) => {
    try {
      const { fieldName, fieldType, required, defaultValue, options } = req.body as {
        fieldName: string; fieldType: string; required?: boolean; defaultValue?: string; options?: string;
      };
      const data = await biznet.post<BiznetResponse<unknown>>("/InputForm/SaveFormField", {
        formId: Number(req.params.id), name: fieldName, type: fieldType,
        required: required ?? false, defaultValue: defaultValue ?? "", options: options ?? "",
      });
      res.json({ ok: data.Status, data: data.Argument, message: data.Message });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get("/api/departments/:orgId", async (req, res) => {
    try {
      const data = await biznet.get<unknown[]>("/Clients/GetDepartmentList", { orgId: req.params.orgId });
      res.json({ ok: true, data: Array.isArray(data) ? data : [] });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  // ─── SSE transport — one session per connection
  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (_req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);
    res.on("close", () => transports.delete(transport.sessionId));
    await server.connect(transport);
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  app.listen(port, () => {
    console.error(`BizNet MCP server (HTTP) listening on port ${port} — CRM: ${process.env.BIZNET_BASE_URL ?? "https://cust05.isokonbpm.com"}`);
  });
}

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT) : undefined;

  if (port) {
    await startHttp(port);
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("BizNet MCP server (stdio) — CRM: " + (process.env.BIZNET_BASE_URL ?? "https://cust05.isokonbpm.com"));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
