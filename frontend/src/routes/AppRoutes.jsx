import React from "react";
import { Routes, Route } from "react-router-dom";

import Home from "../pages/Home";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Unauthorized from "../pages/Unauthorized";
import NotFound from "../pages/NotFound";

import CandidateDashboard from "../pages/CandidateDashboard";
import JobList from "../pages/JobList";
import JobDetail from "../pages/JobDetail";
import ApplicationList from "../pages/ApplicationList";
import ApplicationDetail from "../pages/ApplicationDetail";
import CandidateAssessmentIntro from "../pages/CandidateAssessmentIntro";
import CandidateAttemptView from "../pages/CandidateAttemptView";
import CandidateAttemptList from "../pages/CandidateAttemptList";

import RecruiterDashboard from "../pages/RecruiterDashboard";
import CompanyProfile from "../pages/CompanyProfile";
import RecruiterJobList from "../pages/RecruiterJobList";
import JobForm from "../pages/JobForm";
import JobApplicants from "../pages/JobApplicants";
import RecruiterApplicationDetail from "../pages/RecruiterApplicationDetail";
import RecruiterAssessmentManage from "../pages/RecruiterAssessmentManage";
import RecruiterAssessmentAttempts from "../pages/RecruiterAssessmentAttempts";
import RecruiterAttemptDetail from "../pages/RecruiterAttemptDetail";

import AdminDashboard from "../pages/AdminDashboard";
import ProtectedRoute from "../components/ProtectedRoute";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Pages */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Candidate Protected Routes */}
      <Route
        path="/candidate"
        element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <CandidateDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/candidate/jobs"
        element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <JobList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/candidate/jobs/:id"
        element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <JobDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/candidate/applications"
        element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <ApplicationList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/candidate/applications/:id"
        element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <ApplicationDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/candidate/jobs/:jobId/assessment"
        element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <CandidateAssessmentIntro />
          </ProtectedRoute>
        }
      />
      <Route
        path="/candidate/attempts"
        element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <CandidateAttemptList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/candidate/attempts/:id"
        element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <CandidateAttemptView />
          </ProtectedRoute>
        }
      />

      {/* Recruiter Protected Routes */}
      <Route
        path="/recruiter"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <RecruiterDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruiter/company"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <CompanyProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruiter/jobs"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <RecruiterJobList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruiter/jobs/new"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <JobForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruiter/jobs/:id/edit"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <JobForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruiter/jobs/:id/applicants"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <JobApplicants />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruiter/applications/:id"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <RecruiterApplicationDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruiter/jobs/:id/assessment"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <RecruiterAssessmentManage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruiter/assessments/:assessmentId/attempts"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <RecruiterAssessmentAttempts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruiter/attempts/:id"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <RecruiterAttemptDetail />
          </ProtectedRoute>
        }
      />

      {/* Admin Protected Route (Placeholder) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* 404 Catch-All */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
