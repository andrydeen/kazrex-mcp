# BizNet CRM — REST API Reference

Base URL: `https://kazrex-mcp-production.up.railway.app`  
Auth: `Authorization: Bearer <MCP_API_KEY>` on all endpoints except `/health`

---

## Health

### GET /health
Check if the server is running. No auth required.

**Response:** `OK`

---

## Contacts

### GET /api/contacts
List all contacts (people) in the CRM.

**Response:**
```json
{ "ok": true, "data": [{ "Id": 4288, "Name": "Thomas Hardy" }] }
```

---

### GET /api/contacts/:id
Get full details for a single contact by ID.

**Example:** `GET /api/contacts/4288`

**Response:**
```json
{ "ok": true, "data": { "Id": 4288, "Name": "Thomas Hardy", "Email": "...", "Phone": "..." } }
```

---

### POST /api/contacts/search/phone
Find contacts whose phone number matches a partial string.

**Body:**
```json
{ "phone": "0111" }
```

**Response:**
```json
{ "ok": true, "data": [{ "Id": 4288, "Name": "Thomas Hardy" }] }
```

---

### POST /api/contacts
Create a new person contact.

**Body:**
```json
{
  "type": "NewPrimary",
  "lname": "Smith",
  "fname": "John",
  "title": "Mr",
  "phone": "01234567890",
  "mobilephone": "07700900000",
  "email": "john@example.com",
  "fax": "",
  "organisation": 0,
  "department": 0,
  "position": "Director",
  "clientRef": "",
  "clientStatus": "",
  "birthday": "01/01/1980",
  "marital": "",
  "facebook": "",
  "instagram": "",
  "twitter": "",
  "linkedin": ""
}
```
`type` must be a value from `GET /api/contact-types`.  
`lname` (last name) is required. All other fields are optional.  
`marital` accepts: `Single`, `Married`, `Divorced`, `Widowed`, or `""`.  
`birthday` format: `DD/MM/YYYY`.

**Response:**
```json
{ "ok": true, "data": 4321, "message": "Contact created. ID: 4321" }
```

---

### PATCH /api/contacts/:id
Update an existing contact. Provide only the fields you want to change plus `type` and `lname` (required by BizNet).

**Body:** Same fields as POST /api/contacts, all optional except `type` and `lname`.

**Response:**
```json
{ "ok": true, "data": null, "message": "Updated successfully" }
```

---

### POST /api/contacts/:id/notes
Add a text note to a contact record.

**Example:** `POST /api/contacts/4288/notes`

**Body:**
```json
{ "note": "Called client — left voicemail." }
```

**Response:**
```json
{ "ok": true, "data": null, "message": "Note added" }
```

---

### GET /api/contact-types
List all valid type names for creating contacts (e.g. `NewPrimary`, `Lead`).

**Response:**
```json
{ "ok": true, "data": ["NewPrimary", "Lead", "Referral"] }
```

---

### GET /api/contacts/:id/cases
List all cases associated with a contact or organization ID.

**Example:** `GET /api/contacts/4288/cases`

**Response:**
```json
{ "ok": true, "data": [{ "Id": 87505, "Name": "Hardy v Smith", "Reference": "2024/001" }] }
```

---

## Organizations

### GET /api/organizations
List all organizations in the CRM.

**Response:**
```json
{ "ok": true, "data": [{ "Id": 87599, "Name": "Railway Corporation" }] }
```

---

### POST /api/organizations
Create a new organization.

**Body:**
```json
{
  "type": "PrimaryOrg",
  "name": "Acme Ltd",
  "country": "UK",
  "city": "London",
  "address": "1 Business Park",
  "postCode": "EC1A 1BB",
  "phone": "02012345678",
  "email": "info@acme.com",
  "url": "https://acme.com",
  "reference": "",
  "orgType": "",
  "user": "",
  "notes": ""
}
```
`type` must be a value from `GET /api/organization-types`.  
`name` is required.

**Response:**
```json
{ "ok": true, "data": 87600, "message": "Organization created. ID: 87600" }
```

---

### PATCH /api/organizations/:id
Update an existing organization. `type` and `name` are required.

**Body:** Same fields as POST /api/organizations.

**Response:**
```json
{ "ok": true, "data": null, "message": "Updated successfully" }
```

---

### GET /api/organization-types
List all valid type names for creating organizations (e.g. `PrimaryOrg`).

**Response:**
```json
{ "ok": true, "data": ["PrimaryOrg", "Supplier", "Partner"] }
```

---

### POST /api/link-objects
Create a relationship link between two CRM objects (e.g. contact → organization, or contact → case).

**Body:**
```json
{ "fromId": 4288, "toId": 87599, "relation": "Employee" }
```
`relation` is optional.

**Response:**
```json
{ "ok": true, "data": null, "message": "Objects linked successfully" }
```

---

### GET /api/departments/:orgId
List departments within an organization.

**Example:** `GET /api/departments/87599`

**Response:**
```json
{ "ok": true, "data": [{ "Id": 1, "Name": "Finance", "Ref": "FIN", "Phone": "", "Notes": "" }] }
```

---

## Cases

### GET /api/case-types
List all available case types (also called work types / matters). Use the `Id` as `matterName` when creating a case.

**Response:**
```json
{ "ok": true, "data": [{ "Id": "Litigation", "Name": "Litigation" }] }
```

---

### GET /api/workflows?matter=:matterName
List workflows available for a given case type. Use as the `workflow` field when creating a case.

**Example:** `GET /api/workflows?matter=Litigation`

**Response:**
```json
{ "ok": true, "data": ["Standard Litigation", "Fast Track"] }
```

---

### POST /api/cases
Create a new case. This is a 3-step operation (assign matter → create case → set permissions).

**Body:**
```json
{
  "matterName": "Litigation",
  "rootId": 4288,
  "workflow": "Standard Litigation",
  "manager": "admin",
  "user": "admin",
  "caseName": "Hardy v Smith 2024",
  "caseRef": "2024/042",
  "caseNotes": "Initial instructions received.",
  "due": "31/12/2024",
  "isPublic": true,
  "extraClient": 0
}
```
- `matterName`: from `GET /api/case-types`
- `workflow`: from `GET /api/workflows?matter=X`
- `manager`, `user`: from `GET /api/users`
- `due`: DD/MM/YYYY format
- `extraClient`: additional associated contact ID (0 = none)

**Response:**
```json
{ "ok": true, "data": 87510, "message": "Case created. ID: 87510" }
```

---

### GET /api/cases/:id/events
List all tasks and events for a specific case.

**Example:** `GET /api/cases/87505/events`

**Response:**
```json
{ "ok": true, "data": [{ "Id": 1, "Title": "Initial consultation", "Status": "Complete", "Due": "01/06/2024" }] }
```

---

## Users & Lookups

### GET /api/users
List all CRM users. Returns `Name` and `Value` (the ID/username to use in other calls).

**Response:**
```json
{ "ok": true, "data": [{ "Name": "Admin User", "Value": "admin" }] }
```

---

### GET /api/lookup/:category
Get predefined dropdown values for a given category.

**Common categories:**

| Category | Description |
|---|---|
| `PrimaryStatus` | Contact/lead status values |
| `OrgType` | Organization category types |
| `CustomAction` | Next action options |
| `CallLogTypes` | Types of call log entries |
| `RecordActivity` | Activity types for records |

**Example:** `GET /api/lookup/PrimaryStatus`

**Response:**
```json
{ "ok": true, "data": [{ "Name": "Active", "Value": "active" }] }
```

---

## Object Types (Data Model)

### GET /api/object-types
List all custom object types defined in the system.

**Response:**
```json
{ "ok": true, "data": [{ "Name": "ClientFile", "Type": "regular" }] }
```

---

### GET /api/object-types/:name/fields
Get field definitions for a specific object type.

**Example:** `GET /api/object-types/ClientFile/fields`

**Response:**
```json
{ "ok": true, "data": { "Fields": [{ "Name": "FileRef", "Type": "text" }] } }
```

---

### POST /api/object-types
Create a new custom object type.

**Body:**
```json
{ "name": "InvoiceRecord", "regular": true, "baseType": "" }
```
- `name`: letters, numbers, underscores only — no spaces
- `regular`: `true` = Regular Type, `false` = Smart Type
- `baseType`: name of a type to extend, or `""` for a fresh type (see `GET /api/base-types`)

**Response:**
```json
{ "ok": true, "data": null, "message": "Type created successfully" }
```

---

### GET /api/base-types
List available base types that a new object type can extend.

**Response:**
```json
{ "ok": true, "data": ["BaseContact", "BaseOrg", "BaseCase"] }
```

---

## Input Forms

### GET /api/input-forms
List all input forms. Optionally filter by object type.

**Query params:** `?type=ClientFile` (optional)

**Response:**
```json
{ "ok": true, "data": [{ "Id": 12, "Title": "Client Intake", "Type": "ClientFile" }] }
```

---

### GET /api/input-forms/:id
Get the full definition of a form including all its fields.

**Example:** `GET /api/input-forms/12`

**Response:**
```json
{ "ok": true, "data": { "Id": 12, "Title": "Client Intake", "Fields": [...] } }
```

---

### POST /api/input-forms
Create a new input form.

**Body:**
```json
{ "title": "New Client Form", "objectType": "ClientFile", "group": "Intake" }
```
`objectType` and `group` are optional.

**Response:**
```json
{ "ok": true, "data": 13, "message": "Form created. ID: 13" }
```

---

### POST /api/input-forms/:id/fields
Add a field to an existing input form.

**Example:** `POST /api/input-forms/13/fields`

**Body:**
```json
{
  "fieldName": "Date of Birth",
  "fieldType": "date",
  "required": false,
  "defaultValue": "",
  "options": ""
}
```

**Field types:** `text`, `number`, `bool`, `date`, `flag`, `reference`, `multiline`, `dropdown`  
For `dropdown` fields, pass comma-separated values in `options`: `"Option A,Option B,Option C"`

**Response:**
```json
{ "ok": true, "data": null, "message": "Field added successfully" }
```
