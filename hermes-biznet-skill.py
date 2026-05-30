"""
BizNet CRM skill for Hermes — covers all 28 CRM operations.

Usage:  biznet_crm(action, **kwargs)

Paste this entire file to Hermes to install/update the biznet_crm skill.
After installing, Hermes can call:  biznet_crm("list_contacts")
"""

import requests

BASE_URL = "https://kazrex-mcp-production.up.railway.app"
API_KEY  = "REPLACE_WITH_MCP_API_KEY"   # stored in Hermes memory

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


def biznet_crm(action: str, **kwargs):
    """
    BizNet CRM integration. Call with action + any required kwargs.

    CONTACTS
      list_contacts                         — list all contacts
      get_contact          id               — full details for one contact
      search_by_phone      phone            — find contacts by phone (partial)
      create_contact       type, lname, [fname, email, phone, mobile,
                           address, city, country, postCode, reference,
                           status, user, notes]
      update_contact       id, type, lname, [...same optional fields]
      add_note             id, note         — add text note to contact
      list_contact_types                    — valid 'type' values for contacts
      list_cases           id               — cases for a contact/org

    ORGANIZATIONS
      list_organizations                    — list all orgs
      create_organization  type, name, [country, city, address, postCode,
                           phone, email, url, reference, orgType, user, notes]
      update_organization  id, type, name, [...same optional fields]
      list_organization_types               — valid 'type' values for orgs
      link_objects         fromId, toId, [relation]
      list_departments     orgId            — departments within an org

    CASES
      list_case_types                       — available case/work types
      list_workflows       matter           — workflows for a case type
      create_case          matterName, rootId, workflow, manager, user,
                           caseName, [caseRef, caseNotes, due (DD/MM/YYYY),
                           isPublic, extraClient]
      list_case_events     caseId           — tasks/events for a case

    USERS & LOOKUPS
      list_users                            — all CRM users (Name + Value)
      get_lookup           category         — dropdown values (PrimaryStatus,
                           OrgType, CustomAction, CallLogTypes, RecordActivity)

    OBJECT TYPES
      list_object_types                     — custom object types
      get_type_fields      objectType       — field definitions for a type
      create_object_type   name, [regular, baseType]
      list_base_types                       — base types available to extend

    INPUT FORMS
      list_input_forms     [type]           — all forms, optional filter by type
      get_input_form       formId           — full form definition with fields
      create_input_form    title, [objectType, group]
      add_form_field       formId, fieldName, fieldType, [required,
                           defaultValue, options]
                           fieldType: text|number|bool|date|flag|
                                      reference|multiline|dropdown
    """

    def get(path, params=None):
        r = requests.get(f"{BASE_URL}{path}", headers=HEADERS, params=params, timeout=15)
        r.raise_for_status()
        return r.json()

    def post(path, body=None):
        r = requests.post(f"{BASE_URL}{path}", headers=HEADERS, json=body or {}, timeout=15)
        r.raise_for_status()
        return r.json()

    def patch(path, body=None):
        r = requests.patch(f"{BASE_URL}{path}", headers=HEADERS, json=body or {}, timeout=15)
        r.raise_for_status()
        return r.json()

    # ── Contacts ──────────────────────────────────────────────────────────────

    if action == "list_contacts":
        return get("/api/contacts")

    elif action == "get_contact":
        return get(f"/api/contacts/{kwargs['id']}")

    elif action == "search_by_phone":
        return post("/api/contacts/search/phone", {"phone": kwargs["phone"]})

    elif action == "create_contact":
        body = {
            "type":      kwargs["type"],
            "lname":     kwargs["lname"],
            "fname":     kwargs.get("fname", ""),
            "email":     kwargs.get("email", ""),
            "phone":     kwargs.get("phone", ""),
            "mobile":    kwargs.get("mobile", ""),
            "address":   kwargs.get("address", ""),
            "city":      kwargs.get("city", ""),
            "country":   kwargs.get("country", ""),
            "postCode":  kwargs.get("postCode", ""),
            "reference": kwargs.get("reference", ""),
            "status":    kwargs.get("status", ""),
            "user":      kwargs.get("user", ""),
            "notes":     kwargs.get("notes", ""),
        }
        return post("/api/contacts", body)

    elif action == "update_contact":
        body = {
            "type":      kwargs["type"],
            "lname":     kwargs["lname"],
            "fname":     kwargs.get("fname", ""),
            "email":     kwargs.get("email", ""),
            "phone":     kwargs.get("phone", ""),
            "mobile":    kwargs.get("mobile", ""),
            "address":   kwargs.get("address", ""),
            "city":      kwargs.get("city", ""),
            "country":   kwargs.get("country", ""),
            "postCode":  kwargs.get("postCode", ""),
            "reference": kwargs.get("reference", ""),
            "status":    kwargs.get("status", ""),
            "user":      kwargs.get("user", ""),
            "notes":     kwargs.get("notes", ""),
        }
        return patch(f"/api/contacts/{kwargs['id']}", body)

    elif action == "add_note":
        return post(f"/api/contacts/{kwargs['id']}/notes", {"note": kwargs["note"]})

    elif action == "list_contact_types":
        return get("/api/contact-types")

    elif action == "list_cases":
        return get(f"/api/contacts/{kwargs['id']}/cases")

    # ── Organizations ─────────────────────────────────────────────────────────

    elif action == "list_organizations":
        return get("/api/organizations")

    elif action == "create_organization":
        body = {
            "type":      kwargs["type"],
            "name":      kwargs["name"],
            "country":   kwargs.get("country", ""),
            "city":      kwargs.get("city", ""),
            "address":   kwargs.get("address", ""),
            "postCode":  kwargs.get("postCode", ""),
            "phone":     kwargs.get("phone", ""),
            "email":     kwargs.get("email", ""),
            "url":       kwargs.get("url", ""),
            "reference": kwargs.get("reference", ""),
            "orgType":   kwargs.get("orgType", ""),
            "user":      kwargs.get("user", ""),
            "notes":     kwargs.get("notes", ""),
        }
        return post("/api/organizations", body)

    elif action == "update_organization":
        body = {
            "type":      kwargs["type"],
            "name":      kwargs["name"],
            "country":   kwargs.get("country", ""),
            "city":      kwargs.get("city", ""),
            "address":   kwargs.get("address", ""),
            "postCode":  kwargs.get("postCode", ""),
            "phone":     kwargs.get("phone", ""),
            "email":     kwargs.get("email", ""),
            "url":       kwargs.get("url", ""),
            "reference": kwargs.get("reference", ""),
            "orgType":   kwargs.get("orgType", ""),
            "user":      kwargs.get("user", ""),
            "notes":     kwargs.get("notes", ""),
        }
        return patch(f"/api/organizations/{kwargs['id']}", body)

    elif action == "list_organization_types":
        return get("/api/organization-types")

    elif action == "link_objects":
        return post("/api/link-objects", {
            "fromId":   kwargs["fromId"],
            "toId":     kwargs["toId"],
            "relation": kwargs.get("relation", ""),
        })

    elif action == "list_departments":
        return get(f"/api/departments/{kwargs['orgId']}")

    # ── Cases ─────────────────────────────────────────────────────────────────

    elif action == "list_case_types":
        return get("/api/case-types")

    elif action == "list_workflows":
        return get("/api/workflows", {"matter": kwargs["matter"]})

    elif action == "create_case":
        body = {
            "matterName":  kwargs["matterName"],
            "rootId":      kwargs["rootId"],
            "workflow":    kwargs["workflow"],
            "manager":     kwargs["manager"],
            "user":        kwargs["user"],
            "caseName":    kwargs["caseName"],
            "caseRef":     kwargs.get("caseRef", ""),
            "caseNotes":   kwargs.get("caseNotes", ""),
            "due":         kwargs.get("due", ""),
            "isPublic":    kwargs.get("isPublic", True),
            "extraClient": kwargs.get("extraClient", 0),
        }
        return post("/api/cases", body)

    elif action == "list_case_events":
        return get(f"/api/cases/{kwargs['caseId']}/events")

    # ── Users & Lookups ───────────────────────────────────────────────────────

    elif action == "list_users":
        return get("/api/users")

    elif action == "get_lookup":
        return get(f"/api/lookup/{kwargs['category']}")

    # ── Object Types ──────────────────────────────────────────────────────────

    elif action == "list_object_types":
        return get("/api/object-types")

    elif action == "get_type_fields":
        return get(f"/api/object-types/{kwargs['objectType']}/fields")

    elif action == "create_object_type":
        return post("/api/object-types", {
            "name":     kwargs["name"],
            "regular":  kwargs.get("regular", True),
            "baseType": kwargs.get("baseType", ""),
        })

    elif action == "list_base_types":
        return get("/api/base-types")

    # ── Input Forms ───────────────────────────────────────────────────────────

    elif action == "list_input_forms":
        params = {}
        if "type" in kwargs:
            params["type"] = kwargs["type"]
        return get("/api/input-forms", params or None)

    elif action == "get_input_form":
        return get(f"/api/input-forms/{kwargs['formId']}")

    elif action == "create_input_form":
        return post("/api/input-forms", {
            "title":      kwargs["title"],
            "objectType": kwargs.get("objectType", ""),
            "group":      kwargs.get("group", ""),
        })

    elif action == "add_form_field":
        return post(f"/api/input-forms/{kwargs['formId']}/fields", {
            "fieldName":    kwargs["fieldName"],
            "fieldType":    kwargs["fieldType"],
            "required":     kwargs.get("required", False),
            "defaultValue": kwargs.get("defaultValue", ""),
            "options":      kwargs.get("options", ""),
        })

    else:
        return {"ok": False, "error": f"Unknown action: '{action}'. See docstring for available actions."}
