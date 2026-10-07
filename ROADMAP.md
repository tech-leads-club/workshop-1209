# Roadmap

Classroom ERP for traders/contractors. A closed loop: Item is bought, quantity lives in a Warehouse, quantity is issued to a Job, Staff is assigned to that Job. Administrator and Operator are the only roles.

Language lives in `CONTEXT.md`. Terms below that are not in the glossary yet are working names for this roadmap.

## Done

- **Catalog** — Item, SKU, Unit. No quantity.
- **Warehouse and Stock** — Quantity of an Item in a Warehouse. Catalog stays without balance.
- **Identity** — User and Role: Administrator, Operator.
- **Job** — The work site. Not a Warehouse. No quantity on the Job.
- **Inventory** — Movements that change Stock: Receipt, Transfer between Warehouses, Issue to a Job.
- **Procurement** — Supplier and Purchase. A Receipt from a Purchase raises Stock.
- **Staff and Assignment** — Staff as people who can be allocated. Assignment ties Staff to a Job for a period.
- **Requisition** — Operator asks for an Item for a Job. Administrator turns that into a Purchase.

## Out of scope

Finance and GL, payroll, BOQ and estimating, RFQ and supplier comparison, subcontract and billing, equipment, CRM, quality and safety.
