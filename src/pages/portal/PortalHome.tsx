import { Route, Routes, useParams } from "react-router-dom";
import { PortalLayout } from "./PortalLayout";
import { PortalIdentityProvider } from "./PortalIdentity";
import { PortalDashboard, PortalNewSubmission, PortalProfilePage, PortalSubmissions, PortalTasksPage } from "./PortalPages";
import PortalTaskFormPage from "./PortalTaskFormPage";
import { PortalAvailability } from "./PortalAvailability";
import { PortalSchedule } from "./PortalSchedule";
import PortalSubmissionEdit from "./PortalSubmissionEdit";

function PortalFormRoute() { const { formId } = useParams(); return formId ? <PortalTaskFormPage formId={formId} /> : null; }
export default function PortalHome() { return <PortalIdentityProvider><PortalLayout><Routes><Route index element={<PortalDashboard />} /><Route path="submissions" element={<PortalSubmissions />} /><Route path="submissions/new" element={<PortalNewSubmission />} /><Route path="submissions/:submissionId/edit" element={<PortalSubmissionEdit />} /><Route path="profile" element={<PortalProfilePage />} /><Route path="availability" element={<PortalAvailability />} /><Route path="schedule" element={<PortalSchedule />} /><Route path="tasks" element={<PortalTasksPage />} /><Route path="forms/:formId" element={<PortalFormRoute />} /></Routes></PortalLayout></PortalIdentityProvider>; }
