---
name: e2e-testing
description: E2E testing guide for Kanrei. Covers every page, input, and feature.
---

# Kanrei E2E Testing Guide

## 1. Page/Route Manifest

| # | Route | Page Name | Auth Required | Data Prerequisites | Purpose |
|---|-------|-----------|---------------|-------------------|---------|
| 1 | `/` | Landing | No | None | Marketing page with features, pricing link, trust center link |
| 2 | `/pricing` | Pricing | No | None | Pricing tiers display |
| 3 | `/trust` | Kanrei Trust Center | No | None | Public trust center showing certifications (SOC 2, ISO 27001, HIPAA, GDPR) |
| 4 | `/trust/:orgSlug` | Org Trust Center | No | Published trust page | Organization-specific public trust center |
| 5 | `/sign-in/*` | Sign In | No | None | Clerk sign-in page |
| 6 | `/sign-up/*` | Sign Up | No | None | Clerk sign-up page |
| 7 | `/onboarding` | Onboarding | Yes | New user/org | Organization setup wizard |
| 8 | `/dashboard` | Dashboard | Yes | Organization | Compliance overview: control stats, scan trends, tasks, evidence, readiness widget |
| 9 | `/frameworks` | Frameworks | Yes | Organization | Enable/disable compliance frameworks (SOC 2, HIPAA, ISO 27001, GDPR) |
| 10 | `/controls` | Controls | Yes | Frameworks enabled | Control library with tabs per framework, status management, ISO checks |
| 11 | `/controls/:controlId` | Control Detail | Yes | Control record | Control detail: evidence list, trend chart, risk acceptance, add evidence |
| 12 | `/tasks` | Tasks | Yes | Organization | Compliance task list with filters, create, assign, due dates |
| 13 | `/tasks/:taskId` | Task Detail | Yes | Task record | Task detail with status updates and comments |
| 14 | `/evidence` | Evidence Library | Yes | Organization | Evidence storage, upload, auto-collection scheduling, control linking |
| 15 | `/integrations` | Integrations | Yes | Organization | AWS, GitHub, Slack connection management |
| 16 | `/checks` | Compliance Checks | Yes | Control results | ISO 27001 control check results (pass/fail/warning/manual) |
| 17 | `/alerts` | Alerts | Yes | Notifications | Alert/notification feed with severity filters (critical/high/medium/low) |
| 18 | `/automation-logs` | Automation Logs | Yes | Evidence + audit data | Automated evidence collection log and audit trail |
| 19 | `/monitoring` | Monitoring | Yes | Integrations (AWS/GitHub) | Security scan results, vulnerability dashboard, run scans |
| 20 | `/assistant` | AI Assistant | Yes | Organization | Multi-agent AI chat: Copilot, Evidence, Policy, Questionnaire, Audit agents |
| 21 | `/notifications` | Notifications | Yes | Organization | Notification center with read/dismiss |
| 22 | `/documents` | Documents | Yes | Organization | Document library: policies, procedures with versioning, AI generation |
| 23 | `/policies/new` | New Policy | Yes | Organization | Create new policy document (redirects to documents) |
| 24 | `/policies/:policyId` | Policy Detail | Yes | Policy record | View/edit specific policy |
| 25 | `/settings` | Settings | Yes (Admin) | Organization | Organization settings, members, roles, billing, API keys |
| 26 | `/trust-center` | Trust Center Config | Yes | Organization | Configure and publish organization trust center |
| 27 | `/readiness` | Readiness | Yes | Frameworks + controls | Audit readiness assessment dashboard |
| 28 | `/questionnaires` | Questionnaires | Yes | Organization | Security questionnaire management |
| 29 | `/questionnaires/library` | Questionnaire Library | Yes | Organization | Pre-built questionnaire templates |
| 30 | `/questionnaires/:id` | Questionnaire Detail | Yes | Questionnaire record | Fill/view specific questionnaire |
| 31 | `/vendors` | Vendors | Yes | Organization | Third-party vendor risk management |
| 32 | `/audit-log` | Audit Log | Yes | Organization | Full audit trail with search, filters, export |
| 33 | `*` | Not Found | No | None | 404 page |

## 2. Per-Page Test Specs

### 2.1 Landing Page (`/`)

**Visual Landmarks**: "Kanrei" branding with Shield icon, "Compliance that runs itself" hero, feature cards, CTA buttons

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Get Started button | Button | text "Get started" | Navigate to `/dashboard` |
| Log in button | Button | text "Log in" | Navigate to `/dashboard` |
| Pricing link | Link | text "Pricing" | Navigate to `/pricing` |
| Trust Center link | Link | text "Trust Center" | Navigate to `/trust` |
| Feature cards | Display | Feature list | Scroll into view |

**Tests**:
1. Verify hero section renders with branding
2. Click "Get Started"; verify navigation
3. Click "Pricing"; verify pricing page
4. Click "Trust Center"; verify trust page
5. Verify all 5 feature cards display

### 2.2 Pricing Page (`/pricing`)

**Visual Landmarks**: Pricing tier cards

**Tests**:
1. Verify pricing tiers render
2. Click CTA on a plan; verify navigation

### 2.3 Trust Center (`/trust`)

**Visual Landmarks**: Certification cards (SOC 2 Type II, ISO 27001, HIPAA, GDPR), compliance statistics

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Certification cards | Cards | Cert entries | View cert details |
| Request access button | Button | Access request | Request compliance docs |

**Tests**:
1. Verify all 4 certifications display with status
2. Verify control counts show (e.g., "89/89" for SOC 2)
3. Verify audit dates display

### 2.4 Sign In (`/sign-in/*`)

**Visual Landmarks**: Clerk sign-in component

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Clerk SignIn | Form | Clerk embedded UI | Email OTP |

**Inputs**:

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Email | Valid email | Empty/malformed | Clerk validation |
| OTP Code | 6-digit code | Wrong code | "Incorrect code" |

**Tests**:
1. Verify Clerk sign-in form renders
2. Sign in with email OTP; verify redirect to `/dashboard`

### 2.5 Onboarding (`/onboarding`)

**Visual Landmarks**: Organization setup wizard

**Tests**:
1. New user sees onboarding
2. Set up organization; verify redirect to dashboard

### 2.6 Dashboard (`/dashboard`)

**Visual Landmarks**: Compliance score, control status summary (pass/fail/warning/manual counts), scan trend chart (AreaChart), findings by severity (BarChart), task summary, evidence count, readiness widget, framework links

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Control status cards | Cards | Pass/fail/warning counts | View control summary |
| Scan trend chart | Chart | AreaChart | Visualize scan history |
| Findings by severity chart | Chart | BarChart | View severity distribution |
| Quick links | Links | Navigation cards | Go to tasks, evidence, monitoring |
| Readiness widget | Widget | ReadinessDashboardWidget | View audit readiness |
| Framework cards | Cards | Enabled framework links | Navigate to controls by framework |

**Tests**:
1. Verify all stat cards render with data
2. Verify scan trend chart renders
3. Verify findings by severity chart renders
4. Click quick links; verify navigation
5. Verify readiness widget shows progress

### 2.7 Frameworks (`/frameworks`)

**Visual Landmarks**: Framework cards (SOC 2, HIPAA, ISO 27001, GDPR) with enable/disable toggles, enabled count

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Framework cards | Cards | Framework entries | View framework info |
| Enable/Disable toggle | Button | Toggle button per card | Enable/disable framework |
| Save button | Button | text "Save" | Apply framework changes |

**Tests**:
1. Verify all 4 frameworks display
2. Enable a framework; verify toggle state changes
3. Disable a framework; verify toggle state changes
4. Save; verify controls update
5. Non-admin sees permission denied toast when toggling
6. Verify enabled count updates

### 2.8 Controls (`/controls`)

**Visual Landmarks**: Framework tabs, control list/table, status badges, search, filter, add/delete controls, ISO checks tab

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Framework tabs | Tabs | TabsList | Switch between SOC 2, HIPAA, etc. |
| Search input | Input | Search field | Filter controls |
| Status filter | Buttons | Status filter options (not_started/in_progress/complete) | Filter by status |
| Add Control button | Button | Plus icon | Open add control dialog |
| Control row | Row | Table/card row | Navigate to control detail |
| Status update | Select | Status dropdown | Change control status |
| Delete button | Button | Trash icon | Delete control (with confirmation) |
| ISO tab | Tab | text "ISO 27001" | View ISO control results |
| ISO status filter | Buttons | pass/fail/warning/manual | Filter ISO results |
| Export button | Button | Download icon | Export controls |

**Inputs** (Add Control):

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Framework | Select from enabled | None | Required |
| Name | "Access Control Policy" | Empty | Required |
| Description | "Ensure access controls..." | Empty | Optional |
| Status | "not_started"/"in_progress"/"complete" | None | Default: not_started |

**Tests**:
1. Switch between framework tabs
2. Search for a control by name
3. Filter by status
4. Add a new control; verify in list
5. Click control to view detail
6. Update control status inline
7. Delete a control with confirmation dialog
8. View ISO 27001 tab with check results
9. Export controls

### 2.9 Control Detail (`/controls/:controlId`)

**Visual Landmarks**: Control name/description, status badge, evidence list, trend chart, risk acceptance, linked evidence

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Back button | Button | ArrowLeft icon | Navigate back to controls |
| Status badge | Badge | StatusBadge | Shows current status |
| Add Evidence button | Button | Plus icon | Open add evidence dialog |
| Evidence list | List | EvidenceList component | View linked evidence |
| Trend chart | Chart | ControlTrendChart | View control score over time |
| Accept Risk button | Button | text "Accept Risk" | Open RiskAcceptanceDialog |
| Update Status | Button | Status action | Change control status |

**Inputs** (Add Evidence):

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Title | "MFA Enrollment Report" | Empty | Required |
| Description | "Shows MFA enabled for all users" | Empty | Optional |
| Evidence Type | "document"/"screenshot"/"log"/"report" | None | Default: document |
| File | Upload file (drag & drop or file input) | None | Optional |

**Inputs** (Risk Acceptance Dialog):

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Justification | "Risk accepted due to compensating controls" | Empty | Required |
| Expiration Date | Future date | Past date | Must be future |

**Tests**:
1. View control detail with all sections
2. Add evidence to the control
3. View evidence list
4. View trend chart
5. Accept risk with justification
6. Navigate back to controls list

### 2.10 Tasks (`/tasks`)

**Visual Landmarks**: Task list, create button, status filters, assignee filter, due date

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Create Task button | Button | Plus icon | Open create task dialog |
| Task card/row | Row | Task entries | Navigate to task detail |
| Status filter | Tabs/Buttons | Status options | Filter by status |
| Assignee filter | Select | Assignee dropdown | Filter by assignee |
| Sort controls | Buttons | Sort options | Sort by due date, status, etc. |
| Bulk actions | Checkbox + Bar | Select and act | Bulk status update |

**Inputs** (Create Task):

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Title | "Review access control policy" | Empty | Required |
| Description | "Annual review of AC-1" | Empty | Optional |
| Status | "todo"/"in_progress"/"done" | None | Default: todo |
| Priority | "high"/"medium"/"low" | None | Default: medium |
| Assignee | Select user | None | Optional |
| Due Date | Future date | Past date | Warning |
| Control Link | Select control | None | Optional |

**Tests**:
1. Create a new task
2. Filter tasks by status
3. Click task to view detail
4. Assign task to user
5. Update task status
6. Set due date

### 2.11 Task Detail (`/tasks/:taskId`)

**Visual Landmarks**: Task title, status, assignee, description, comments, linked control

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Status update | Select/Button | Status dropdown | Change status |
| Assignee | Select | Assignee dropdown | Reassign |
| Add Comment | Input + Button | Comment field | Add comment |
| Back button | Button | ArrowLeft | Navigate back |

**Tests**:
1. View task detail
2. Update task status
3. Add a comment
4. Change assignee
5. Navigate back to task list

### 2.12 Evidence Library (`/evidence`)

**Visual Landmarks**: Evidence list, upload button, auto-collection schedule, control linking, type icons

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Upload Evidence button | Button | Upload icon | Open upload dialog |
| Auto-Collect button | Button | Wand icon | Trigger auto-collection |
| Evidence cards | Cards | Evidence entries | View evidence details |
| Schedule toggle | Switch | Schedule enabled | Enable/disable auto-collection |
| Schedule frequency | Select | Frequency dropdown | Set daily/weekly/manual |
| Link to Control | Select | Control dropdown per evidence | Link evidence to control |
| Type filter | Filter | Type icons | Filter by type |

**Inputs** (Upload Evidence):

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Title | "Q1 Access Review" | Empty | Required |
| Description | "Quarterly review of user access" | Empty | Optional |
| Evidence Type | "document"/"screenshot"/"log"/"report" | None | Required |
| Control | Select from controls | None | Optional |
| File | Upload or drag-and-drop | None | Optional |

**Tests**:
1. Upload new evidence with title and type
2. Verify evidence appears in list
3. Link evidence to a control
4. Set auto-collection schedule to "daily"
5. Trigger auto-collect
6. Filter by evidence type
7. View evidence details

### 2.13 Integrations (`/integrations`)

**Visual Landmarks**: Integration cards: AWS, GitHub, Slack; connection status badges

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| AWS Connect button | Button | Cloud icon + "Connect" | Open AWS connection dialog |
| AWS Disconnect button | Button | Disconnect action | Disconnect AWS |
| AWS Validate button | Button | Validate action | Validate connection |
| AWS CloudFormation button | Button | CFN action | Open CloudFormation dialog |
| GitHub Connect button | Button | Github icon + "Connect" | Open GitHub dialog |
| GitHub Disconnect button | Button | Disconnect action | Disconnect GitHub |
| Slack Connect button | Button | Slack icon + "Connect" | Redirect to Slack install |
| Slack Disconnect button | Button | Disconnect action | Disconnect Slack |
| Connection status | Badge | Status indicator | Shows active/pending/error/disconnected |

**Inputs** (AWS Connection):

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Role ARN | "arn:aws:iam::123456789:role/KanreiRole" | Not starting with "arn:aws:iam::" | "Invalid Role ARN format" |

**Inputs** (GitHub Connection):

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Repository | "owner/repo" | Empty | Required |

**Tests**:
1. View all integration cards with status
2. Connect AWS with Role ARN
3. Validate AWS connection
4. Connect GitHub repository
5. View Slack connection status
6. Disconnect an integration
7. Verify status badges update

### 2.14 Compliance Checks (`/checks`)

**Visual Landmarks**: Check results summary (pass/fail/warning/manual counts), check list with status icons

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Search input | Input | Search field | Filter checks |
| Result filter | Buttons | pass/fail/warning/manual | Filter by result |
| Check rows | Rows | Check entries | View check details |
| Summary cards | Cards | Count cards | View totals |

**Tests**:
1. Verify summary cards show counts
2. Filter checks by result status
3. Search for specific check
4. Verify all checks display with correct status icons

### 2.15 Alerts (`/alerts`)

**Visual Landmarks**: Alert cards with severity indicators, severity filter buttons, active/dismissed counts

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Severity filter | Buttons | all/critical/high/medium/low | Filter by severity |
| Dismiss button | Button | X icon | Dismiss alert (mark read) |
| Alert cards | Cards | Alert entries | View alert details |
| Active count badge | Badge | Count display | Shows active alerts |

**Tests**:
1. Verify alert list loads
2. Filter by severity (critical, high)
3. Dismiss an alert
4. Verify active count updates after dismissal

### 2.16 Automation Logs (`/automation-logs`)

**Visual Landmarks**: Automated evidence count, total evidence count, audit entry count, recent activity log

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Stat cards | Cards | Count cards | View totals |
| Activity log | List | Log entries | View recent actions |

**Tests**:
1. Verify stat cards display
2. Verify activity log entries render with action icons
3. Check activity timestamps

### 2.17 Monitoring (`/monitoring`)

**Visual Landmarks**: Scan results, vulnerability summary, run scan button, scan history, findings table, PDF export

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Run AWS Scan button | Button | Cloud + Scan | Trigger AWS security scan |
| Run GitHub Scan button | Button | Github + Scan | Trigger GitHub pipeline scan |
| Scan history table | Table | Scan entries | View scan details |
| Findings table | Table | Finding rows | View finding details |
| Export PDF button | Button | Download icon | Export scan report as PDF |
| Scan progress | Progress bar | Progress indicator | Shows scan progress |
| Schedule config | Section | MonitoringScheduleConfig | Configure scan schedules |

**Tests**:
1. Run an AWS scan (requires AWS integration)
2. Run a GitHub scan (requires GitHub integration)
3. View scan results with pass/fail/warning counts
4. View individual findings with severity
5. Export scan report as PDF
6. View scan history
7. Configure monitoring schedule

### 2.18 AI Assistant (`/assistant`)

**Visual Landmarks**: Agent selector tabs (Copilot, Evidence, Policy, Questionnaire, Audit), chat interface, message history, file attachment, voice controls, PDF export

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Agent tabs | Tabs | TabsList | Switch between AI agents |
| Message input | Input | Chat input field | Type message |
| Send button | Button | Send icon | Send message |
| Microphone button | Button | Mic/MicOff icon | Toggle speech-to-text |
| Speaker button | Button | Volume2/VolumeX icon | Toggle text-to-speech |
| File attachment button | Button | Paperclip icon | Attach document for analysis |
| Export PDF button | Button | Download icon | Export conversation as PDF |
| Clear chat button | Button | X icon | Clear conversation |

**Inputs**:

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Message | "What evidence do I need for SOC 2 CC6.1?" | Empty | Send disabled |
| File attachment | PDF, DOCX, TXT, CSV, JSON | Unsupported type | Parse error |

**Agent Types**:
- **Copilot** (general): General compliance questions about SOC 2, HIPAA, ISO 27001, GDPR
- **Evidence**: Generate evidence reports, explain evidence needs
- **Policy**: Draft security policies, review existing ones
- **Questionnaire**: Auto-fill security questionnaire answers
- **Audit**: Generate audit preparation summaries

**Tests**:
1. Select Copilot agent; send compliance question
2. Verify AI response renders in chat
3. Switch to Evidence agent; ask about evidence
4. Switch to Policy agent; request policy draft
5. Attach a document; verify parsing
6. Use speech-to-text (if available)
7. Export conversation as PDF
8. Clear chat and verify reset
9. Questionnaire agent: ask a security question; verify response saved

### 2.19 Notifications (`/notifications`)

**Visual Landmarks**: Notification list, read/unread indicators

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Notification items | List | Notification entries | View details |
| Mark read button | Button | Read action | Mark notification read |
| Dismiss button | Button | X icon | Dismiss notification |

**Tests**:
1. Verify notifications load
2. Mark notification as read
3. Dismiss notification

### 2.20 Documents (`/documents`)

**Visual Landmarks**: Document library with grid/list toggle, search, category filter, version history, AI generate button

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Create Document button | Button | Plus icon | Open create document dialog |
| Search input | Input | Search field | Filter documents |
| Category filter | Select | Category dropdown | Filter by category |
| View toggle | Buttons | Grid/List icons | Switch grid/list view |
| Document card/row | Clickable | Document entry | Open document |
| Edit button | Button | Pencil icon | Edit document |
| Preview button | Button | Eye icon | Preview document |
| Delete button | Button | Trash2 icon | Delete document (with confirmation) |
| Download button | Button | Download icon | Download document |
| AI Generate button | Button | Bot icon | Generate document with AI |
| Version history | List | Version entries | View past versions |

**Inputs** (Create/Edit Document):

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Title | "Information Security Policy" | Empty | Required |
| Category | "policy"/"procedure"/"standard"/"guideline" | None | Required |
| Content | Rich text / markdown | Empty | Required |
| Status | "draft"/"published"/"archived" | None | Default: draft |

**Tests**:
1. Create a new document
2. Edit document content
3. Publish document
4. Search documents by title
5. Filter by category
6. Toggle grid/list view
7. Generate document with AI
8. View version history
9. Download document
10. Delete document with confirmation

### 2.21 Settings (`/settings`)

**Visual Landmarks**: Organization settings: name, members, roles, API keys, billing

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Org Name input | Input | Name field | Edit organization name |
| Save button | Button | Save action | Save settings |
| Members list | List | Member entries | View/manage members |
| Invite button | Button | Plus/Invite icon | Invite team member |
| Role selector | Select | Role dropdown | Change member role |
| API Keys section | Section | API key management | Generate/revoke keys |
| Billing section | Section | Billing info | View/manage subscription |

**Inputs**:

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Organization Name | "Acme Security" | Empty | Required |
| Invite Email | "security@acme.com" | Invalid format | Validation error |
| Role | "admin"/"editor"/"viewer" | None | Required |

**Tests**:
1. Update organization name
2. Invite a team member
3. Change member role
4. Generate API key
5. View billing information

### 2.22 Trust Center Config (`/trust-center`)

**Visual Landmarks**: Trust center configuration, publish toggle, public URL

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Publish toggle | Switch | Publish control | Enable/disable public trust page |
| Edit content | Editor | Content sections | Edit trust center content |
| Preview button | Button | Eye icon | Preview public trust center |
| Copy URL button | Button | Copy icon | Copy public URL |

**Tests**:
1. Configure trust center content
2. Enable publishing
3. Preview public trust center
4. Copy and verify public URL

### 2.23 Readiness (`/readiness`)

**Visual Landmarks**: Audit readiness dashboard, framework-specific readiness scores, gap analysis

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Framework selector | Tabs/Select | Framework options | View readiness per framework |
| Readiness score | Display | Score indicator | Shows overall readiness % |
| Gap items | List | Gap analysis entries | View compliance gaps |

**Tests**:
1. View overall readiness score
2. Switch between frameworks
3. Review gap analysis items
4. Verify scores match control completion rates

### 2.24 Questionnaires (`/questionnaires`)

**Visual Landmarks**: Questionnaire list, create button, library link

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Create Questionnaire button | Button | Plus icon | Create new questionnaire |
| Library link | Link | text "Library" | Navigate to `/questionnaires/library` |
| Questionnaire cards | Cards | Questionnaire entries | Navigate to detail |

**Tests**:
1. View questionnaire list
2. Create a new questionnaire
3. Navigate to library
4. Click questionnaire to view detail

### 2.25 Questionnaire Library (`/questionnaires/library`)

**Visual Landmarks**: Pre-built questionnaire templates

**Tests**:
1. Browse available templates
2. Use a template to create new questionnaire

### 2.26 Questionnaire Detail (`/questionnaires/:id`)

**Visual Landmarks**: Question list, answer fields, progress indicator, AI-assist button

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Answer fields | Input/Textarea | Question answer areas | Enter answers |
| Save button | Button | Save icon | Save progress |
| AI Assist button | Button | AI icon | Auto-fill with AI |
| Submit button | Button | text "Submit" | Submit completed questionnaire |

**Tests**:
1. View questionnaire questions
2. Answer questions manually
3. Use AI to auto-fill answers
4. Save progress
5. Submit completed questionnaire

### 2.27 Vendors (`/vendors`)

**Visual Landmarks**: Vendor list, add vendor button, risk assessment

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Add Vendor button | Button | Plus icon | Add new vendor |
| Vendor cards | Cards | Vendor entries | View vendor detail |
| Risk level badge | Badge | Risk indicator | Shows low/medium/high/critical |
| Edit button | Button | Edit icon | Edit vendor |
| Delete button | Button | Trash icon | Delete vendor |

**Inputs** (Add Vendor):

| Field | Valid | Invalid | Expected Error |
|-------|-------|---------|----------------|
| Vendor Name | "AWS" | Empty | Required |
| Category | "Cloud Provider"/"SaaS"/"Infrastructure" | None | Required |
| Risk Level | "low"/"medium"/"high"/"critical" | None | Required |
| Description | "Primary cloud infrastructure" | Empty | Optional |
| Contact | "vendor@aws.com" | Invalid email | Validation |
| Review Date | Future date | Empty | Optional |

**Tests**:
1. Add a new vendor
2. Set risk level
3. View vendor details
4. Edit vendor information
5. Delete a vendor

### 2.28 Audit Log (`/audit-log`)

**Visual Landmarks**: Log table with action, resource, user, timestamp columns, search, filters, export

**Interactive Elements**:

| Element | Type | Selector Hint | Action |
|---------|------|---------------|--------|
| Search input | Input | Search field | Filter log entries |
| Action filter | Select | Action type dropdown | Filter by action (create/update/delete/connect/etc.) |
| Resource filter | Select | Resource type | Filter by resource type |
| Date range filter | Input | Date pickers | Filter by date range |
| Export button | Button | Download icon | Export log as CSV |
| Log rows | Table rows | Log entry rows | View entry details |

**Tests**:
1. Verify audit log table loads
2. Search for specific action
3. Filter by action type
4. Filter by resource type
5. Filter by date range
6. Export audit log
7. Verify log entries show correct action icons and colors

## 3. User Flows (End-to-End Journeys)

### Flow 1: Initial Setup
1. Navigate to `/sign-in`; sign in with Clerk OTP
2. Complete `/onboarding`; set up organization
3. Navigate to `/frameworks`; enable SOC 2 and HIPAA
4. Save; verify controls populated
5. Navigate to `/controls`; verify SOC 2 controls appear
6. Navigate to `/dashboard`; verify overview stats

### Flow 2: Control Management and Evidence
1. Navigate to `/controls`
2. Add a new control "Employee Security Training"
3. Click control to view detail
4. Add evidence: upload "Training Records Q1" document
5. Verify evidence appears in control detail
6. Navigate to `/evidence`; verify evidence in library
7. Link evidence to control
8. Navigate to `/controls`; verify control has evidence count

### Flow 3: Task Workflow
1. Navigate to `/tasks`; create task "Review access control policy"
2. Assign to team member; set due date
3. Navigate to task detail
4. Update status to "in_progress"
5. Add a comment "Started review"
6. Update status to "done"
7. Navigate back to task list; verify task shows completed

### Flow 4: Integration and Monitoring
1. Navigate to `/integrations`
2. Connect AWS with Role ARN
3. Validate connection; verify "Connected" status
4. Navigate to `/monitoring`
5. Run AWS security scan
6. Wait for scan completion; view results
7. Verify findings display with severity
8. Export scan report as PDF
9. Navigate to `/dashboard`; verify scan data in trend chart

### Flow 5: AI-Assisted Compliance
1. Navigate to `/assistant`
2. Select Copilot agent
3. Ask "What controls do I need for SOC 2 CC6.1?"
4. Verify AI response with relevant controls
5. Switch to Policy agent
6. Ask "Write an access control policy for SOC 2"
7. Verify policy draft generated
8. Switch to Evidence agent
9. Ask "Generate evidence report for MFA enrollment"
10. Verify evidence report generated

### Flow 6: Document Management
1. Navigate to `/documents`
2. Create "Information Security Policy" with category="policy"
3. Edit content; add policy text
4. Publish document
5. Generate another document with AI
6. Search for document by title
7. View version history
8. Download document

### Flow 7: Vendor Risk Assessment
1. Navigate to `/vendors`
2. Add vendor "AWS" with category="Cloud Provider", risk="medium"
3. Add vendor "Slack" with category="SaaS", risk="low"
4. Review vendor list
5. Edit AWS risk to "low" after review
6. Verify vendor list updates

### Flow 8: Questionnaire Flow
1. Navigate to `/questionnaires/library`
2. Use a template to create questionnaire
3. Navigate to questionnaire detail
4. Answer questions manually
5. Use AI to auto-fill remaining answers
6. Save progress
7. Submit completed questionnaire

### Flow 9: Audit Readiness Check
1. Navigate to `/readiness`
2. Review overall readiness score
3. Switch to SOC 2 framework view
4. Identify gaps in compliance
5. Navigate to `/controls`; address gaps
6. Return to `/readiness`; verify score improved

## 4. Test Data & Accounts

### Auth Method
Clerk email OTP using `$NAMOS_TEST_EMAIL` / `$NAMOS_TEST_EMAIL_PASSWORD`

### Seed Data (create in dependency order)
1. **Organization**: Created during onboarding
2. **Frameworks**: Enable SOC 2 and at least one other (HIPAA, ISO 27001, or GDPR)
3. **Controls**: Auto-populated when frameworks enabled; add at least 1 custom control
4. **Tasks**: Create at least 3 tasks (todo, in_progress, done)
5. **Evidence**: Upload at least 2 evidence items of different types
6. **Documents**: Create at least 2 documents (1 policy, 1 procedure)
7. **Vendors**: Add at least 2 vendors with different risk levels
8. **Integrations**: Connect AWS (if credentials available) or verify connection UI
9. **Questionnaires**: Create at least 1 questionnaire

### Roles & Permissions
- **admin**: Full access to all features including settings, frameworks, integrations
- **editor**: Can manage controls, tasks, evidence, documents; cannot manage org settings
- **viewer**: Read-only access to dashboards, controls, evidence

Permission checks use `useOrganization().can("permission:action")` pattern. Denied actions log to audit via `logPermissionDenied`.

### Backend
- **Supabase/PostgreSQL**: Data storage via `@/lib/db` (query, run functions)
- **React Query**: Data fetching with caching
- **Sonner**: Toast notifications via `toast()` from `sonner`

## 5. Assertions Checklist

### Global Assertions
- [ ] Unauthenticated users see Clerk sign-in on `/sign-in`
- [ ] Public pages (`/`, `/pricing`, `/trust`, `/trust/:orgSlug`) work without auth
- [ ] Protected pages redirect to sign-in when unauthenticated
- [ ] AuthGuard wrapper enforces authentication
- [ ] RequirePermission wrapper enforces role-based access
- [ ] Dark/light mode toggle works across all pages
- [ ] Sidebar navigation renders with correct items
- [ ] AppLayout wraps all authenticated pages consistently
- [ ] Loading states show `LoadingState` component
- [ ] Error states show `ErrorState` with retry button
- [ ] Empty states show `EmptyState` component
- [ ] RefetchDimmer shows when data is refreshing

### Navigation
- [ ] All sidebar links navigate to correct routes
- [ ] Current page highlighted in sidebar
- [ ] `/policies` redirects to `/documents`
- [ ] Browser back/forward works
- [ ] Breadcrumb navigation works on detail pages
- [ ] Back buttons on detail pages return to list

### Forms
- [ ] Required fields show validation on empty submit
- [ ] Successful operations show sonner toast
- [ ] Error operations show error toast
- [ ] Dialogs close after successful submission
- [ ] AlertDialog confirmation required for destructive actions (delete)
- [ ] File uploads support drag-and-drop
- [ ] Select dropdowns populate with correct options

### Data Persistence
- [ ] Frameworks persist enabled/disabled state
- [ ] Controls persist with status
- [ ] Tasks persist with status, assignee, due date
- [ ] Evidence persists with type and control links
- [ ] Documents persist with content and versions
- [ ] Vendors persist with risk levels
- [ ] Integrations persist connection status
- [ ] Questionnaire answers persist
- [ ] Audit log captures all CRUD actions

### Toast Messages (Sonner)
- [ ] "Failed to update framework" on framework toggle error
- [ ] "Only admins and editors can update frameworks" for permission denied
- [ ] "Invalid Role ARN format" for bad AWS ARN
- [ ] Success toasts for create/update/delete operations
- [ ] Error toasts with descriptive messages

### Keyboard Shortcuts
- [ ] No custom keyboard shortcuts documented (standard browser shortcuts apply)

### Security & Permissions
- [ ] Permission denied actions logged via `logPermissionDenied`
- [ ] Viewer role cannot modify data
- [ ] Admin-only sections hidden from non-admins
- [ ] Audit log captures all user actions
