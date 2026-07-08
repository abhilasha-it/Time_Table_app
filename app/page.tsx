"use client";

import React, { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import PreflightModal from "@/components/PreflightModal";
import Dashboard from "@/components/Dashboard";
import TimetableGrid from "@/components/TimetableGrid";
import ConfigPanel from "@/components/ConfigPanel";
import Link from "next/link";
import { AlertCircle, RefreshCw, Layers } from "lucide-react";

export default function Home() {
  const [metadata, setMetadata] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPreflightOpen, setIsPreflightOpen] = useState(false);

  // Filters for current grid view
  const [filters, setFilters] = useState({
    branchId: "",
    year: "1",
    section: "A",
  });

  // Fetch initial metadata and slots
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Get metadata
      const metaRes = await fetch("/api/metadata");
      if (!metaRes.ok) throw new Error("Failed to load college configuration.");
      const metaData = await metaRes.json();
      setMetadata(metaData);

      // Set default branch in filter if available
      if (metaData.branches && metaData.branches.length > 0) {
        setFilters((prev) => ({
          ...prev,
          branchId: prev.branchId || metaData.branches[0].id,
        }));
      }

      // 2. Get slots
      const slotsRes = await fetch("/api/timetable");
      if (!slotsRes.ok) throw new Error("Failed to load timetable slots.");
      const slotsData = await slotsRes.json();
      setSlots(slotsData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Trigger Toast Notification Helper
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Generate Timetable
  const handleGenerate = async () => {
    setIsGenerating(true);
    showToast("Generating college timetable... running constraint engine.", "success");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Generation failed.");

      showToast(data.message || "Timetable generated successfully!", "success");
      
      // Refresh slots
      const slotsRes = await fetch("/api/timetable");
      if (slotsRes.ok) {
        const slotsData = await slotsRes.json();
        setSlots(slotsData);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to generate timetable.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Update Timetable Slot (CRUD)
  const handleUpdateSlot = async (slotId: string, updatedData: { facultyId: string; roomId: string; subjectId: string }) => {
    try {
      const res = await fetch("/api/timetable", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: slotId, ...updatedData }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Update failed.");

      showToast("Slot updated successfully!", "success");
      
      // Update slots state locally to avoid full fetch reload
      setSlots((prev) => prev.map((s) => (s.id === slotId ? data : s)));
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to update slot.", "error");
    }
  };

  // Delete Timetable Slot (CRUD)
  const handleDeleteSlot = async (slotId: string) => {
    try {
      const res = await fetch(`/api/timetable?id=${slotId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Deletion failed.");

      showToast("Slot cleared successfully!", "success");
      
      // Remove slot from local state
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to clear slot.", "error");
    }
  };

  // Export File (XLSX / PDF)
  const handleExport = (
    format: "xlsx" | "pdf",
    type: "section" | "all" | "faculty",
    facultyId?: string
  ) => {
    const queryParams: Record<string, string> = {
      format,
      type,
    };

    if (type === "section") {
      queryParams.branchId = filters.branchId;
      queryParams.year = filters.year;
      queryParams.section = filters.section;
    }

    if (type === "faculty" && facultyId) {
      queryParams.facultyId = facultyId;
    }

    const query = new URLSearchParams(queryParams).toString();
    
    // Trigger download in new window/tab
    window.open(`/api/export?${query}`, "_blank");
    showToast(`Downloading ${type} timetable in ${format.toUpperCase()} format.`, "success");
  };

  // Calculate stats for Dashboard
  const getStats = () => {
    if (!metadata) return { branchesCount: 0, sectionsCount: 0, teachersCount: 0, roomsCount: 0, slotsScheduledCount: 0 };
    
    return {
      branchesCount: metadata.branches.length,
      sectionsCount: metadata.branches.reduce((acc: number, b: any) => acc + (b.sections?.length || 0), 0),
      teachersCount: metadata.teachers.length,
      roomsCount: metadata.rooms.length,
      slotsScheduledCount: slots.length,
    };
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
        <RefreshCw className="h-10 w-10 animate-spin text-indigo-500" />
        <p className="mt-4 text-sm font-medium text-slate-400">Loading academic schedules...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center text-white">
        <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-8 max-w-md">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h3 className="mt-4 text-lg font-bold">Failed to Initialize</h3>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <button
            onClick={fetchData}
            className="mt-6 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700 transition cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-indigo-500 selection:text-white pb-16">
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-indigo-900/10 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 h-[600px] w-[600px] rounded-full bg-purple-900/10 blur-[120px]" />
      </div>

      <div className="relative z-10 space-y-8">
        <Navbar onGenerate={() => setIsPreflightOpen(true)} isGenerating={isGenerating} />

        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Welcome Header */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl bg-gradient-to-r from-white via-indigo-200 to-purple-200 bg-clip-text text-transparent">ABES Engineering College Timetables</h2>
              <p className="text-sm text-slate-400 mt-1">Configure parameters, auto-schedule classes, and export sheets.</p>
            </div>
            <div>
              <Link 
                href="/admin" 
                className="inline-flex items-center space-x-1.5 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <Layers className="h-4 w-4 text-indigo-400" />
                <span>Admin Panel</span>
              </Link>
            </div>
          </div>

          {/* Stats Dashboard */}
          <Dashboard stats={getStats()} />

          {/* Main Grid Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Visual Grid</h3>
                <span className="text-xs text-indigo-400 font-medium">Interactive Scheduler</span>
              </div>
              <TimetableGrid
                slots={slots}
                metadata={metadata}
                selectedFilters={filters}
                setSelectedFilters={setFilters}
                onUpdateSlot={handleUpdateSlot}
                onDeleteSlot={handleDeleteSlot}
                onExport={handleExport}
              />
            </div>

            {/* Sidebar Configurations */}
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-white">College Parameters</h3>
              <ConfigPanel metadata={metadata} />
            </div>
          </div>
        </main>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center space-x-2.5 rounded-xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5">
          <div className={`h-2.5 w-2.5 rounded-full ${toast.type === "success" ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
          <span className="text-xs font-semibold text-slate-200">{toast.message}</span>
        </div>
      )}

      <PreflightModal
        isOpen={isPreflightOpen}
        onClose={() => setIsPreflightOpen(false)}
        onProceed={handleGenerate}
        isGenerating={isGenerating}
      />
    </div>
  );
}
