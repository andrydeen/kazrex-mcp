import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import * as svc from "./biznet-service.js";
import { BiznetApiError } from "./biznet-service.js";

const server = new McpServer({
  name: "biznet-mcp-server",
  version: "1.0.0",
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

// CRM-level failures (Status:false) come back as readable text, not tool errors
function tool<A>(fn: (args: A) => Promise<string>) {
  return async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      if (e instanceof BiznetApiError) return ok(`Error: ${e.message}`);
      throw e;
    }
  };
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
  tool(async () => {
    const data = await svc.listContacts();
    if (!Array.isArray(data) || data.length === 0) return "No contacts found.";
    const lines = data.map((c) => `ID: ${c.Id} | Name: ${c.Name}`).join("\n");
    return `Found ${data.length} contacts:\n\n${lines}`;
  })
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
  tool(async ({ id }) => {
    const data = await svc.getContact(id);
    return JSON.stringify(data, null, 2);
  })
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
  tool(async ({ phone }) => {
    const data = await svc.searchContactsByPhone(phone);
    if (!Array.isArray(data) || data.length === 0) return `No contacts found for phone: ${phone}`;
    const lines = data.map((c) => `ID: ${c.Id} | Name: ${c.Name}`).join("\n");
    return `Found ${data.length} match(es):\n\n${lines}`;
  })
);

const contactFieldsSchema = {
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
};

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
      ...contactFieldsSchema,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  tool(async (params) => {
    const newId = await svc.createContact(params);
    return `Contact created successfully. New contact ID: ${newId}`;
  })
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
      ...contactFieldsSchema,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  tool(async ({ id, ...params }) => {
    await svc.updateContact(id, params);
    return `Contact ID ${id} updated successfully.`;
  })
);

server.registerTool(
  "biznet_list_contact_types",
  {
    title: "List Contact Types",
    description: `List all available contact type names. Use these values for the 'type' field when creating contacts.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  tool(async () => {
    const data = await svc.listContactTypes();
    if (!Array.isArray(data) || data.length === 0) return "No contact types found.";
    return `Available contact types:\n${data.map((t) => `- ${t}`).join("\n")}`;
  })
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
  tool(async ({ contactId, note }) => {
    await svc.addContactNote(contactId, note);
    return `Note added to contact ID ${contactId} (logged as call log entry).`;
  })
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
  tool(async () => {
    const data = await svc.listOrganizations();
    if (!Array.isArray(data) || data.length === 0) return "No organizations found.";
    const lines = data.map((o) => `ID: ${o.Id} | Name: ${o.Name}`).join("\n");
    return `Found ${data.length} organizations:\n\n${lines}`;
  })
);

server.registerTool(
  "biznet_list_organization_types",
  {
    title: "List Organization Types",
    description: `List available organization type names. Use these for the 'type' field when creating organizations.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  tool(async () => {
    const data = await svc.listOrganizationTypes();
    if (!Array.isArray(data) || data.length === 0) return "No organization types found.";
    return `Available organization types:\n${data.map((t) => `- ${t}`).join("\n")}`;
  })
);

const organizationFieldsSchema = {
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
};

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
      ...organizationFieldsSchema,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  tool(async (params) => {
    const newId = await svc.saveOrganization(0, params);
    return `Organization created successfully. New organization ID: ${newId}`;
  })
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
      ...organizationFieldsSchema,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  tool(async ({ id, ...params }) => {
    await svc.saveOrganization(id, params);
    return `Organization ID ${id} updated successfully.`;
  })
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
  tool(async ({ fromId, toId, relation }) => {
    await svc.linkObjects(fromId, toId, relation);
    return `Objects ${fromId} and ${toId} linked successfully.`;
  })
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
  tool(async ({ contactId }) => {
    const data = await svc.listCasesForContact(contactId);
    if (!Array.isArray(data) || data.length === 0) return `No cases found for contact ID ${contactId}.`;
    const lines = data
      .map((c) => `ID: ${c.Id} | Name: ${c.Name}${c.Reference ? ` | Ref: ${c.Reference}` : ""}`)
      .join("\n");
    return `Found ${data.length} cases for contact ${contactId}:\n\n${lines}`;
  })
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
  tool(async () => {
    const data = await svc.listCaseTypes();
    if (!Array.isArray(data) || data.length === 0) return "No case types defined.";
    const lines = data.map((m) => `ID: ${m.Id} | Name: ${m.Name}`).join("\n");
    return `Available case types:\n\n${lines}`;
  })
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
  tool(async ({ matterName }) => {
    const data = await svc.listWorkflows(matterName);
    if (!Array.isArray(data) || data.length === 0) return `No workflows found for matter type: ${matterName}`;
    return `Workflows for '${matterName}':\n${data.map((w) => `- ${w}`).join("\n")}`;
  })
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
  tool(async (params) => {
    const caseId = await svc.createCase(params);
    return `Case created successfully.\nCase ID: ${caseId}\nCase Name: ${params.caseName}`;
  })
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
  tool(async ({ caseId }) => {
    const data = await svc.getCaseEvents(caseId);
    if (!Array.isArray(data) || data.length === 0) return `No events found for case ID ${caseId}.`;
    return `Case ${caseId} has ${data.length} event(s):\n\n${JSON.stringify(data, null, 2)}`;
  })
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
  tool(async () => {
    const data = await svc.listObjectTypes();
    if (!Array.isArray(data) || data.length === 0) return "No custom object types defined.";
    const lines = data.map((t) => `Name: ${t.Name} | Type: ${t.Type}`).join("\n");
    return `Custom object types:\n\n${lines}`;
  })
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
  tool(async ({ objectType }) => {
    const data = await svc.getTypeFields(objectType);
    return JSON.stringify(data, null, 2);
  })
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
  tool(async ({ name, regular, baseType }) => {
    await svc.createObjectType(name, regular ?? true, baseType ?? "");
    return `Object type '${name}' created successfully.`;
  })
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
  tool(async () => {
    const data = await svc.getBaseTypes();
    if (!Array.isArray(data) || data.length === 0) return "No base types available.";
    return `Available base types:\n${data.map((t) => `- ${t}`).join("\n")}`;
  })
);

server.registerTool(
  "biznet_update_field",
  {
    title: "Update Single Field on Object",
    description: `Set a single field value on any CRM object (contact, organization, or custom object).
This is the only reliable way to save address fields (Address, Address2, City, County, PostCode, Country)
and also works for Fax, Phone, Email, and custom fields.
Use biznet_get_type_fields to discover field names for a type.`,
    inputSchema: z.object({
      objectId: z.number().int().positive().describe("ID of the contact, organization, or custom object"),
      fieldName: z.string().min(1).describe("Field name (e.g. Address, City, PostCode, Country, Fax)"),
      value: z.string().describe("New value for the field"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  tool(async ({ objectId, fieldName, value }) => {
    await svc.updateFieldValue(objectId, fieldName, value);
    return `Field '${fieldName}' updated on object ID ${objectId}.`;
  })
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
  tool(async ({ type }) => {
    const data = await svc.listInputForms(type);
    if (!Array.isArray(data) || data.length === 0) return "No input forms found.";
    return `Input forms (${data.length}):\n\n${JSON.stringify(data, null, 2)}`;
  })
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
  tool(async ({ formId }) => {
    const data = await svc.getInputForm(formId);
    return JSON.stringify(data, null, 2);
  })
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
  tool(async ({ title, objectType, group }) => {
    const formId = await svc.createInputForm(title, objectType, group);
    return `Input form '${title}' created. Form ID: ${formId}`;
  })
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
  tool(async (params) => {
    await svc.addFormField(params);
    return `Field '${params.fieldName}' added to form ID ${params.formId}.`;
  })
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
  tool(async () => {
    const data = await svc.listUsers();
    if (!Array.isArray(data) || data.length === 0) return "No users found.";
    const lines = data.map((u) => `Name: ${u.Name} | Value: ${u.Value}`).join("\n");
    return `Users (${data.length}):\n\n${lines}`;
  })
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
  tool(async ({ category, sort }) => {
    const data = await svc.getLookupList(category, sort ?? false);
    if (!Array.isArray(data) || data.length === 0) return `No values found for category: ${category}`;
    const lines = data.map((i) => `Name: ${i.Name} | Value: ${i.Value}`).join("\n");
    return `Lookup values for '${category}' (${data.length}):\n\n${lines}`;
  })
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
  tool(async ({ organizationId }) => {
    const data = await svc.getDepartments(organizationId);
    if (!Array.isArray(data) || data.length === 0) return `No departments found for organization ${organizationId}.`;
    return `Departments for organization ${organizationId}:\n\n${JSON.stringify(data, null, 2)}`;
  })
);

// ─── SERVER STARTUP ───────────────────────────────────────────────────────────

async function startHttp(port: number) {
  // HTTP mode exposes CRM write access on a public URL — refuse to run unauthenticated
  const API_KEY = process.env.MCP_API_KEY;
  if (!API_KEY) {
    console.error(
      "FATAL: MCP_API_KEY must be set when running in HTTP mode (PORT is set). " +
        "Generate one with: openssl rand -hex 32"
    );
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${API_KEY}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => res.send("OK"));

  // ─── REST API (for Hermes and other HTTP clients) ─────────────────────────

  type RouteHandler = (req: express.Request) => Promise<{ data?: unknown; message?: string }>;

  // Shared error mapping: CRM Status:false → 400, anything else → 500
  function route(handler: RouteHandler) {
    return async (req: express.Request, res: express.Response) => {
      try {
        const result = await handler(req);
        res.json({ ok: true, ...result });
      } catch (e) {
        if (e instanceof BiznetApiError) {
          res.status(400).json({ ok: false, message: e.message });
        } else {
          res.status(500).json({ ok: false, error: String(e) });
        }
      }
    };
  }

  const asList = (data: unknown) => ({ data: Array.isArray(data) ? data : [] });

  app.get("/api/contacts", route(async () => asList(await svc.listContacts())));

  app.get("/api/contacts/:id", route(async (req) => ({ data: await svc.getContact(req.params.id) })));

  app.post("/api/contacts/search/phone", route(async (req) => {
    const { phone } = req.body as { phone: string };
    return asList(await svc.searchContactsByPhone(phone));
  }));

  app.post("/api/contacts", route(async (req) => ({
    data: await svc.createContact(req.body as svc.ContactParams),
  })));

  app.patch("/api/contacts/:id", route(async (req) => ({
    data: await svc.updateContact(Number(req.params.id), req.body as svc.ContactParams),
  })));

  app.post("/api/contacts/:id/notes", route(async (req) => {
    const { note, type, customerName, phone } = req.body as {
      note: string; type?: string; customerName?: string; phone?: string;
    };
    await svc.addContactNote(Number(req.params.id), note, { type, customerName, phone });
    return { message: "Note saved to call log." };
  }));

  app.get("/api/organizations", route(async () => asList(await svc.listOrganizations())));

  app.post("/api/organizations", route(async (req) => ({
    data: await svc.saveOrganization(0, req.body as svc.OrganizationParams),
  })));

  app.patch("/api/organizations/:id", route(async (req) => ({
    data: await svc.saveOrganization(Number(req.params.id), req.body as svc.OrganizationParams),
  })));

  app.get("/api/contacts/:id/cases", route(async (req) => asList(await svc.listCasesForContact(req.params.id))));

  app.get("/api/case-types", route(async () => asList(await svc.listCaseTypes())));

  app.get("/api/users", route(async () => asList(await svc.listUsers())));

  app.get("/api/lookup/:category", route(async (req) => asList(await svc.getLookupList(req.params.category))));

  app.post("/api/objects/:id/field", route(async (req) => {
    const { fieldName, value } = req.body as { fieldName: string; value: string };
    await svc.updateFieldValue(Number(req.params.id), fieldName, value);
    return { message: `Field '${fieldName}' updated.` };
  }));

  app.get("/api/contact-types", route(async () => asList(await svc.listContactTypes())));

  app.get("/api/organization-types", route(async () => asList(await svc.listOrganizationTypes())));

  app.post("/api/link-objects", route(async (req) => {
    const { fromId, toId, relation } = req.body as { fromId: number; toId: number; relation?: string };
    return { data: await svc.linkObjects(fromId, toId, relation) };
  }));

  app.get("/api/workflows", route(async (req) => {
    const { matter } = req.query as { matter?: string };
    if (!matter) throw new BiznetApiError("matter query param required");
    return asList(await svc.listWorkflows(matter));
  }));

  app.post("/api/cases", route(async (req) => {
    const caseId = await svc.createCase(req.body as svc.CreateCaseParams);
    return { data: caseId, message: `Case created. ID: ${caseId}` };
  }));

  app.get("/api/cases/:id/events", route(async (req) => asList(await svc.getCaseEvents(req.params.id))));

  app.get("/api/object-types", route(async () => asList(await svc.listObjectTypes())));

  app.get("/api/object-types/:name/fields", route(async (req) => ({
    data: await svc.getTypeFields(req.params.name),
  })));

  app.post("/api/object-types", route(async (req) => {
    const { name, regular, baseType } = req.body as { name: string; regular?: boolean; baseType?: string };
    return { data: await svc.createObjectType(name, regular ?? true, baseType ?? "") };
  }));

  app.get("/api/base-types", route(async () => asList(await svc.getBaseTypes())));

  app.get("/api/input-forms", route(async (req) =>
    asList(await svc.listInputForms(req.query.type ? String(req.query.type) : undefined))
  ));

  app.get("/api/input-forms/:id", route(async (req) => ({ data: await svc.getInputForm(req.params.id) })));

  app.post("/api/input-forms", route(async (req) => {
    const { title, objectType, group } = req.body as { title: string; objectType?: string; group?: string };
    return { data: await svc.createInputForm(title, objectType, group) };
  }));

  app.post("/api/input-forms/:id/fields", route(async (req) => {
    const { fieldName, fieldType, required, defaultValue, options } = req.body as {
      fieldName: string; fieldType: string; required?: boolean; defaultValue?: string; options?: string;
    };
    return {
      data: await svc.addFormField({
        formId: Number(req.params.id), fieldName, fieldType, required, defaultValue, options,
      }),
    };
  }));

  app.get("/api/departments/:orgId", route(async (req) => asList(await svc.getDepartments(req.params.orgId))));

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
