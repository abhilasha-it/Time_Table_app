"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Layers, Users, Home, BookOpen, Clock, Lock, ArrowLeft, Plus, Edit3, 
  Trash2, X, AlertTriangle, CheckCircle, Upload, ShieldCheck 
} from "lucide-react";
import SectionTreeView from "../../components/SectionTreeView";
import BulkImporter from "../../components/BulkImporter";
import YearlyScheduler from "../../components/YearlyScheduler";

type TabType = 
  | "yearlygenerate"
  | "import"
  | "branches" 
  | "sections" 
  | "subjects" 
  | "faculty" 
  | "rooms" 
  | "timeslots" 
  | "fixedallocations"
  | "auditlogs";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>("yearlygenerate");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYearIdState, setSelectedYearIdState] = useState("");
  const [selectedFilters, setSelectedFilters] = useState({
    branchId: "",
    year: "",
    section: ""
  });

  const [metadata, setMetadata] = useState<any>({
    branches: [],
    years: [],
    sections: [],
    subjects: [],
    faculty: [],
    rooms: [],
    timeslots: [],
    fixedallocations: [],
  });

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Dialog State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Form States (unified data structure)
  const [formData, setFormData] = useState<any>({});
  const [activeConflictReport, setActiveConflictReport] = useState<any>(null);

  // Tab Details Helper
  const tabConfig = {
    yearlygenerate: { label: "Yearly Scheduler", icon: Layers, api: "" },
    import: { label: "Bulk CSV Importer", icon: Upload, api: "" },
    branches: { label: "Branches", icon: Layers, api: "branches" },
    sections: { label: "Sections", icon: Layers, api: "sections" },
    subjects: { label: "Subjects", icon: BookOpen, api: "subjects" },
    faculty: { label: "Faculty", icon: Users, api: "faculty" },
    rooms: { label: "Rooms", icon: Home, api: "rooms" },
    timeslots: { label: "TimeSlots", icon: Clock, api: "timeslots" },
    fixedallocations: { label: "Fixed Allocations", icon: Lock, api: "fixed-allocations" },
    auditlogs: { label: "Audit Logs", icon: ShieldCheck, api: "auditlogs" },
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch all metadata
  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const keys: TabType[] = ["branches", "sections", "subjects", "faculty", "rooms", "timeslots", "fixedallocations", "auditlogs"];
      const updatedMeta: any = {};
      
      // Load years too, since sections/subjects require them
      const yearsRes = await fetch("/api/admin/years");
      if (yearsRes.ok) {
        updatedMeta.years = await yearsRes.json();
      } else {
        updatedMeta.years = [];
      }

      for (const key of keys) {
        if (key === "yearlygenerate" || key === "import") continue;
        const apiPath = tabConfig[key].api;
        const res = await fetch(`/api/admin/${apiPath}`);
        if (res.ok) {
          updatedMeta[key] = await res.json();
        } else {
          updatedMeta[key] = [];
        }
      }

      // Map branches years relation nesting for TreeView
      if (updatedMeta.branches && updatedMeta.years) {
        updatedMeta.branches = updatedMeta.branches.map((b: any) => ({
          ...b,
          years: updatedMeta.years
            .filter((y: any) => y.branchId === b.id)
            .map((y: any) => ({
              ...y,
              sections: (updatedMeta.sections || []).filter((s: any) => s.yearId === y.id)
            }))
        }));
      }

      setMetadata(updatedMeta);
      
      // Set default year state if empty
      if (updatedMeta.years.length > 0 && !selectedYearIdState) {
        setSelectedYearIdState(updatedMeta.years[0].id);
      }
    } catch (error) {
      console.error("Error loading admin data:", error);
      showToast("Failed to sync database parameters.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const auth = localStorage.getItem("adminAuth");
    if (auth === "true") {
      setIsAuthenticated(true);
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData();
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "admin" && password === "admin123") {
      localStorage.setItem("adminAuth", "true");
      setIsAuthenticated(true);
      setLoginError("");
      showToast("Welcome Admin! Authentication approved.", "success");
    } else {
      setLoginError("Invalid administrator username or password.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminAuth");
    setIsAuthenticated(false);
    showToast("Logged out successfully.", "success");
  };

  const handleSelectSection = (branchId: string, year: string, sectionName: string) => {
    setSelectedFilters({ branchId, year, section: sectionName });
    
    // Switch to yearlygenerate tab
    setActiveTab("yearlygenerate");
    
    // Find the year object to set the selectedYearId
    const branch = metadata.branches.find((b: any) => b.id === branchId);
    const yearObj = branch?.years?.find((y: any) => y.yearNumber === Number(year));
    if (yearObj) {
      setSelectedYearIdState(yearObj.id);
    }
  };

  // REST operations
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const apiPath = tabConfig[activeTab as Exclude<TabType, "yearlygenerate" | "import" | "auditlogs">].api;
    const method = modalMode === "create" ? "POST" : "PUT";
    
    try {
      const res = await fetch(`/api/admin/${apiPath}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.status === 409 && data.conflict) {
        setActiveConflictReport({
          conflicts: data.conflicts,
          formData: formData,
          apiPath: apiPath
        });
        return;
      }

      if (!res.ok) throw new Error(data.error || "Save operation failed.");

      showToast(`Record ${modalMode === "create" ? "created" : "updated"} successfully!`, "success");
      setIsModalOpen(false);
      fetchAllData();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to commit record updates.", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this record? This action cannot be undone.")) return;
    const apiPath = tabConfig[activeTab as Exclude<TabType, "yearlygenerate" | "import">].api;

    try {
      const res = await fetch(`/api/admin/${apiPath}?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete operation failed.");

      showToast("Record removed successfully!", "success");
      fetchAllData();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Delete operation rejected.", "error");
    }
  };

  const openCreateModal = () => {
    setModalMode("create");
    setEditingItem(null);
    
    // Initialize default form fields based on active tab
    const defaults: any = {};
    if (activeTab === "sections") {
      defaults.sectionName = "A";
      defaults.strength = 80;
      defaults.yearId = metadata.years[0]?.id || "";
      defaults.lunchSlotIndex = 4;
    } else if (activeTab === "subjects") {
      defaults.type = "ACADEMIC";
      defaults.credits = 3;
      defaults.weeklyLectureHours = 3;
      defaults.weeklyLabHours = 0;
      defaults.yearId = metadata.years[0]?.id || "";
    } else if (activeTab === "faculty") {
      defaults.maxHoursPerWeek = 16;
      defaults.source = "COLLEGE";
    } else if (activeTab === "rooms") {
      defaults.type = "CLASSROOM";
      defaults.capacity = 80;
    } else if (activeTab === "timeslots") {
      defaults.day = 0;
      defaults.slotIndex = 0;
      defaults.startTime = "09:00";
      defaults.endTime = "10:00";
    } else if (activeTab === "fixedallocations") {
      defaults.isLocked = true;
      const trainingSubjects = metadata.subjects.filter((s: any) => s.type === "TRAINING");
      defaults.subjectId = trainingSubjects[0]?.id || "";
      defaults.facultyId = metadata.faculty[0]?.id || "";
      defaults.sectionId = metadata.sections[0]?.id || "";
      defaults.roomId = metadata.rooms[0]?.id || "";
      defaults.timeSlotId = metadata.timeslots[0]?.id || "";
      defaults.consecutiveLectures = 1;
    }
    
    setFormData(defaults);
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setModalMode("edit");
    setEditingItem(item);
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({
      ...prev,
      [name]: name === "credits" || name === "weeklyLectureHours" || name === "weeklyLabHours" || name === "maxHoursPerWeek" || name === "capacity" || name === "day" || name === "slotIndex" || name === "strength" || name === "lunchSlotIndex"
        ? Number(value)
        : value
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: checked }));
  };

  const getDayName = (dayIdx: number) => {
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayIdx] || "Monday";
  };

  if (!isAuthenticated && !isLoading) {
    return (
      <div className="relative min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        {/* Decorative background glows */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-slate-950/20 to-slate-950 pointer-events-none" />
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px]" />

        <div className="relative z-10 w-full max-w-md bg-slate-900/60 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 p-3.5 text-white shadow-lg shadow-indigo-600/30 border border-white/10">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Academic Portal
            </h1>
            <p className="text-xs text-slate-400">
              Administrative Control and Constraint Engines Sign-In
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-xs text-rose-400">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin"
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/30 active:scale-[0.98] transition-all cursor-pointer"
            >
              Sign In to Dashboard
            </button>
          </form>

          <div className="text-center pt-2 border-t border-white/5">
            <Link href="/" className="text-xs text-slate-400 hover:text-white transition">
              Back to Home page
            </Link>
          </div>
        </div>

        {/* Toast Alert */}
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center space-x-2.5 rounded-xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5">
            <div className={`h-2.5 w-2.5 rounded-full ${toast.type === "success" ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
            <span className="text-xs font-semibold text-slate-200">{toast.message}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white md:px-8">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-slate-950/20 to-slate-950 pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl space-y-6">
        
        {/* Header Navigation */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center space-x-4">
            <Link 
              href="/" 
              className="rounded-xl border border-white/5 bg-slate-900/60 p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight md:text-2xl">Administration Panel</h1>
              <p className="text-xs text-slate-400 mt-0.5">Configure engineering branches, workloads, rooms, and schedule algorithms.</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
          >
            Logout
          </button>
        </div>

        {/* Dynamic Portal Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-sm shadow-md">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Branches</span>
            <span className="text-2xl font-bold text-indigo-400 block mt-1">{metadata.branches?.length || 0}</span>
          </div>
          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-sm shadow-md">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sections</span>
            <span className="text-2xl font-bold text-purple-400 block mt-1">{metadata.sections?.length || 0}</span>
          </div>
          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-sm shadow-md">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Subjects</span>
            <span className="text-2xl font-bold text-pink-400 block mt-1">{metadata.subjects?.length || 0}</span>
          </div>
          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-sm shadow-md">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Faculty</span>
            <span className="text-2xl font-bold text-emerald-400 block mt-1">{metadata.faculty?.length || 0}</span>
          </div>
          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-sm shadow-md col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Classrooms & Labs</span>
            <span className="text-2xl font-bold text-amber-400 block mt-1">{metadata.rooms?.length || 0}</span>
          </div>
        </div>

        {/* Dynamic Layout Split */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Navigation Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Tree View Directory */}
            <SectionTreeView
              branches={metadata.branches}
              selectedFilters={selectedFilters}
              onSelectSection={handleSelectSection}
            />

            {/* Entity Navigation List */}
            <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 shadow-xl backdrop-blur-sm space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2 mb-2">Controls & Data</h3>
              <nav className="space-y-1">
                {(Object.keys(tabConfig) as TabType[]).map((key) => {
                  const config = tabConfig[key];
                  const Icon = config.icon;
                  const isActive = activeTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setActiveTab(key);
                        setIsModalOpen(false);
                      }}
                      className={`w-full flex items-center space-x-3 rounded-xl px-4 py-2.5 text-xs font-semibold transition cursor-pointer ${
                        isActive 
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                          : "text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{config.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Core Content Area */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Header and Add Actions */}
            {activeTab !== "yearlygenerate" && activeTab !== "import" && activeTab !== "auditlogs" && (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white capitalize">{tabConfig[activeTab].label} Directory</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add, edit, or delete active database entries.
                  </p>
                </div>
                <button
                  onClick={openCreateModal}
                  className="flex items-center space-x-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500 transition cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Record</span>
                </button>
              </div>
            )}

            {/* TAB CONTENTS: YEARLY SCHEDULER SCREEN */}
            {activeTab === "yearlygenerate" && (
              <YearlyScheduler 
                metadata={metadata} 
                onSuccess={fetchAllData}
                selectedYearId={selectedYearIdState}
                setSelectedYearId={setSelectedYearIdState}
              />
            )}

            {/* TAB CONTENTS: BULK IMPORTER SCREEN */}
            {activeTab === "import" && (
              <BulkImporter onSuccess={fetchAllData} />
            )}

            {/* TAB CONTENTS: RESTFUL PARAMETERS CRUD LISTS */}
            {activeTab !== "yearlygenerate" && activeTab !== "import" && (
              <div className="overflow-hidden rounded-2xl border border-white/5 bg-slate-900/20 shadow-xl backdrop-blur-sm">
                {isLoading ? (
                  <div className="py-24 text-center">
                    <Clock className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                    <p className="mt-4 text-xs text-slate-400">Loading parameters...</p>
                  </div>
                ) : (
                  <>
                    {/* 1. BRANCHES TABLE */}
                    {activeTab === "branches" && (
                      <table className="min-w-full divide-y divide-white/5 text-left text-xs">
                        <thead className="bg-slate-900/50">
                          <tr>
                            <th className="px-6 py-4 font-semibold text-slate-400">Code</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Name</th>
                            <th className="px-6 py-4 text-right font-semibold text-slate-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {metadata.branches.length === 0 ? (
                            <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500">No branches added.</td></tr>
                          ) : (
                            metadata.branches.map((b: any) => (
                              <tr key={b.id} className="hover:bg-slate-900/10">
                                <td className="px-6 py-4 font-bold text-indigo-400 font-mono">{b.code}</td>
                                <td className="px-6 py-4 font-medium text-white">{b.name}</td>
                                <td className="px-6 py-4 text-right space-x-3">
                                  <button onClick={() => openEditModal(b)} className="text-slate-400 hover:text-white cursor-pointer"><Edit3 className="h-4 w-4 inline" /></button>
                                  <button onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 className="h-4 w-4 inline" /></button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {/* 2. SECTIONS TABLE */}
                    {activeTab === "sections" && (
                      <table className="min-w-full divide-y divide-white/5 text-left text-xs">
                        <thead className="bg-slate-900/50">
                          <tr>
                            <th className="px-6 py-4 font-semibold text-slate-400">Section Name</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Branch & Year</th>
                            <th className="px-6 py-4 text-center font-semibold text-slate-400">Strength</th>
                            <th className="px-6 py-4 text-center font-semibold text-slate-400">Lunch Period</th>
                            <th className="px-6 py-4 text-right font-semibold text-slate-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {metadata.sections.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No sections added.</td></tr>
                          ) : (
                            metadata.sections.map((sec: any) => (
                              <tr key={sec.id} className="hover:bg-slate-900/10">
                                <td className="px-6 py-4 font-bold text-white">{sec.sectionName}</td>
                                <td className="px-6 py-4 text-slate-300">
                                  {sec.year?.branch?.code} ({sec.year?.yearNumber} Yr)
                                </td>
                                <td className="px-6 py-4 text-center font-mono text-white">{sec.strength} stds</td>
                                <td className="px-6 py-4 text-center font-mono text-indigo-400">Period {sec.lunchSlotIndex + 1}</td>
                                <td className="px-6 py-4 text-right space-x-3">
                                  <button onClick={() => openEditModal(sec)} className="text-slate-400 hover:text-white cursor-pointer"><Edit3 className="h-4 w-4 inline" /></button>
                                  <button onClick={() => handleDelete(sec.id)} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 className="h-4 w-4 inline" /></button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {/* 3. SUBJECTS TABLE */}
                    {activeTab === "subjects" && (
                      <table className="min-w-full divide-y divide-white/5 text-left text-xs">
                        <thead className="bg-slate-900/50">
                          <tr>
                            <th className="px-6 py-4 font-semibold text-slate-400">Code</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Name</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Hours (L-L)</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Branch & Yr</th>
                            <th className="px-6 py-4 text-center font-semibold text-slate-400">Type</th>
                            <th className="px-6 py-4 text-right font-semibold text-slate-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {metadata.subjects.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No subjects added.</td></tr>
                          ) : (
                            metadata.subjects.map((sub: any) => (
                              <tr key={sub.id} className="hover:bg-slate-900/10">
                                <td className="px-6 py-4 font-bold text-indigo-400 font-mono">{sub.code}</td>
                                <td className="px-6 py-4 font-medium text-white">{sub.name}</td>
                                <td className="px-6 py-4 font-mono text-slate-300">
                                  {sub.weeklyLectureHours}L - {sub.weeklyLabHours || 0}P
                                </td>
                                <td className="px-6 py-4 text-slate-300">
                                  {sub.year?.branch?.code} ({sub.year?.yearNumber} Yr)
                                </td>
                                <td className="px-6 py-4 text-sm">
                                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                                    sub.type === "TRAINING" 
                                      ? "bg-purple-500/10 text-purple-400" 
                                      : "bg-blue-500/10 text-blue-400"
                                  }`}>
                                    {sub.type}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right space-x-3">
                                  <button onClick={() => openEditModal(sub)} className="text-slate-400 hover:text-white cursor-pointer"><Edit3 className="h-4 w-4 inline" /></button>
                                  <button onClick={() => handleDelete(sub.id)} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 className="h-4 w-4 inline" /></button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {/* 4. FACULTY TABLE */}
                    {activeTab === "faculty" && (
                      <table className="min-w-full divide-y divide-white/5 text-left text-xs">
                        <thead className="bg-slate-900/50">
                          <tr>
                            <th className="px-6 py-4 font-semibold text-slate-400">Name</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Department</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Source</th>
                            <th className="px-6 py-4 text-center font-semibold text-slate-400">Max Hours</th>
                            <th className="px-6 py-4 text-right font-semibold text-slate-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {metadata.faculty.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No faculty added.</td></tr>
                          ) : (
                            metadata.faculty.map((fac: any) => (
                              <tr key={fac.id} className="hover:bg-slate-900/10">
                                <td className="px-6 py-4 font-bold text-white">{fac.name}</td>
                                <td className="px-6 py-4 text-slate-300">{fac.department}</td>
                                <td className="px-6 py-4">
                                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                                    fac.source === "TRAINING_DEPT" 
                                      ? "bg-purple-500/10 text-purple-400" 
                                      : "bg-blue-500/10 text-blue-400"
                                  }`}>
                                    {fac.source}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center font-mono text-white">{fac.maxHoursPerWeek} hrs</td>
                                <td className="px-6 py-4 text-right space-x-3">
                                  <button onClick={() => openEditModal(fac)} className="text-slate-400 hover:text-white cursor-pointer"><Edit3 className="h-4 w-4 inline" /></button>
                                  <button onClick={() => handleDelete(fac.id)} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 className="h-4 w-4 inline" /></button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {/* 5. ROOMS TABLE */}
                    {activeTab === "rooms" && (
                      <table className="min-w-full divide-y divide-white/5 text-left text-xs">
                        <thead className="bg-slate-900/50">
                          <tr>
                            <th className="px-6 py-4 font-semibold text-slate-400">Name</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Type</th>
                            <th className="px-6 py-4 text-center font-semibold text-slate-400">Capacity</th>
                            <th className="px-6 py-4 text-right font-semibold text-slate-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {metadata.rooms.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No rooms added.</td></tr>
                          ) : (
                            metadata.rooms.map((rm: any) => (
                              <tr key={rm.id} className="hover:bg-slate-900/10">
                                <td className="px-6 py-4 font-bold text-white">{rm.name}</td>
                                <td className="px-6 py-4">
                                  <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold border ${
                                    rm.type === "LAB" 
                                      ? "bg-teal-500/10 text-teal-400 border-teal-500/20" 
                                      : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                  }`}>
                                    {rm.type}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center font-mono text-white">{rm.capacity} seats</td>
                                <td className="px-6 py-4 text-right space-x-3">
                                  <button onClick={() => openEditModal(rm)} className="text-slate-400 hover:text-white cursor-pointer"><Edit3 className="h-4 w-4 inline" /></button>
                                  <button onClick={() => handleDelete(rm.id)} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 className="h-4 w-4 inline" /></button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {/* 6. TIMESLOTS TABLE */}
                    {activeTab === "timeslots" && (
                      <table className="min-w-full divide-y divide-white/5 text-left text-xs">
                        <thead className="bg-slate-900/50">
                          <tr>
                            <th className="px-6 py-4 font-semibold text-slate-400">Day</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Slot Index</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Hours</th>
                            <th className="px-6 py-4 text-right font-semibold text-slate-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {metadata.timeslots.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No timeslots added.</td></tr>
                          ) : (
                            metadata.timeslots.map((ts: any) => (
                              <tr key={ts.id} className="hover:bg-slate-900/10">
                                <td className="px-6 py-4 font-semibold text-white">{getDayName(ts.day)}</td>
                                <td className="px-6 py-4 font-mono text-slate-300">Period {ts.slotIndex + 1}</td>
                                <td className="px-6 py-4 font-mono text-slate-400">{ts.startTime} - {ts.endTime}</td>
                                <td className="px-6 py-4 text-right space-x-3">
                                  <button onClick={() => openEditModal(ts)} className="text-slate-400 hover:text-white cursor-pointer"><Edit3 className="h-4 w-4 inline" /></button>
                                  <button onClick={() => handleDelete(ts.id)} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 className="h-4 w-4 inline" /></button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {/* 7. FIXED ALLOCATIONS TABLE */}
                    {activeTab === "fixedallocations" && (
                      <table className="min-w-full divide-y divide-white/5 text-left text-xs">
                        <thead className="bg-slate-900/50">
                          <tr>
                            <th className="px-6 py-4 font-semibold text-slate-400">Subject</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Faculty</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">Section</th>
                            <th className="px-6 py-4 font-semibold text-slate-400">TimeSlot & Room</th>
                            <th className="px-6 py-4 text-right font-semibold text-slate-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {metadata.fixedallocations.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No fixed allocations.</td></tr>
                          ) : (
                            metadata.fixedallocations.map((fa: any) => (
                              <tr key={fa.id} className="hover:bg-slate-900/10">
                                <td className="px-6 py-4 font-bold text-white">{fa.subject?.code}</td>
                                <td className="px-6 py-4 text-slate-300">{fa.faculty?.name}</td>
                                <td className="px-6 py-4 text-slate-300">{fa.section?.name}</td>
                                <td className="px-6 py-4 font-mono text-slate-400">
                                  {getDayName(fa.timeSlot?.day)} P{fa.timeSlot?.slotIndex + 1} ({fa.room?.name})
                                </td>
                                <td className="px-6 py-4 text-right space-x-3">
                                  <button onClick={() => openEditModal(fa)} className="text-slate-400 hover:text-white cursor-pointer"><Edit3 className="h-4 w-4 inline" /></button>
                                  <button onClick={() => handleDelete(fa.id)} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 className="h-4 w-4 inline" /></button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {/* 8. AUDIT LOGS TABLE */}
                    {activeTab === "auditlogs" && (
                      <table className="min-w-full divide-y divide-white/5 text-left text-xs">
                        <thead className="bg-slate-950/40">
                          <tr>
                            <th className="px-6 py-3 font-semibold text-slate-400">Timestamp</th>
                            <th className="px-6 py-3 font-semibold text-slate-400">Action</th>
                            <th className="px-6 py-3 font-semibold text-slate-400">Details</th>
                            <th className="px-6 py-3 font-semibold text-slate-400">User</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {(!metadata.auditlogs || metadata.auditlogs.length === 0) ? (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No audit log entries available.</td></tr>
                          ) : (
                            metadata.auditlogs.slice().reverse().map((log: any) => (
                              <tr key={log.id} className="hover:bg-slate-900/10">
                                <td className="px-6 py-4 text-slate-400 font-mono">
                                  {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 font-bold">
                                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                                    log.action === "CREATE" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                    log.action === "EDIT" || log.action === "UPDATE" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                                    log.action === "DELETE" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                                    "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  }`}>
                                    {log.action}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-300 max-w-md truncate" title={log.details}>
                                  {log.details}
                                </td>
                                <td className="px-6 py-4 text-slate-400 font-medium">
                                  {log.user}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CRUD MODAL DIALOG */}
      {isModalOpen && activeTab !== "yearlygenerate" && activeTab !== "import" && activeTab !== "auditlogs" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h3 className="text-base font-bold text-white capitalize">
                {modalMode === "create" ? "Add New" : "Edit"} {activeTab}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              
              {/* BRANCHES FORM */}
              {activeTab === "branches" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Branch Code</label>
                    <input
                      type="text"
                      name="code"
                      required
                      value={formData.code || ""}
                      onChange={handleInputChange}
                      placeholder="e.g. CSE"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Branch Name</label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name || ""}
                      onChange={handleInputChange}
                      placeholder="e.g. Computer Science Engineering"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}

              {/* SECTIONS FORM */}
              {activeTab === "sections" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Section Name (e.g. A, B, Section 1, CSE-A)</label>
                    <input
                      type="text"
                      name="sectionName"
                      required
                      maxLength={50}
                      value={formData.sectionName || ""}
                      onChange={handleInputChange}
                      placeholder="e.g. Section A"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Student Strength</label>
                    <input
                      type="number"
                      name="strength"
                      required
                      value={formData.strength || 80}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Lunch Period Slot</label>
                    <select
                      name="lunchSlotIndex"
                      value={formData.lunchSlotIndex !== undefined ? formData.lunchSlotIndex : 4}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-mono"
                    >
                      <option value={0}>Period 1 (8:50 am - 9:40 am)</option>
                      <option value={1}>Period 2 (9:40 am - 10:30 am)</option>
                      <option value={2}>Period 3 (10:40 am - 11:30 am)</option>
                      <option value={3}>Period 4 (11:30 am - 12:20 pm)</option>
                      <option value={4}>Period 5 (12:20 pm - 1:10 pm)</option>
                      <option value={5}>Period 6 (1:10 pm - 2:00 pm)</option>
                      <option value={6}>Period 7 (2:00 pm - 2:50 pm)</option>
                      <option value={7}>Period 8 (2:50 pm - 3:40 pm)</option>
                      <option value={8}>Period 9 (3:40 pm - 4:30 pm)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Branch Year Target</label>
                    <select
                      name="yearId"
                      value={formData.yearId || ""}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {metadata.years.map((y: any) => (
                        <option key={y.id} value={y.id}>
                          {y.branch?.code} - Year {y.yearNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* SUBJECTS FORM */}
              {activeTab === "subjects" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Subject Code</label>
                    <input
                      type="text"
                      name="code"
                      required
                      value={formData.code || ""}
                      onChange={handleInputChange}
                      placeholder="e.g. CS-301"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Course Title</label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name || ""}
                      onChange={handleInputChange}
                      placeholder="e.g. Database Management Systems"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Subject Category</label>
                    <select
                      value={formData.weeklyLabHours > 0 ? "LAB" : (formData.type === "TRAINING" ? "TRAINING" : "THEORY")}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setFormData((prev: any) => {
                          if (cat === "THEORY") {
                            return { ...prev, type: "ACADEMIC", weeklyLectureHours: 3, weeklyLabHours: 0 };
                          } else if (cat === "LAB") {
                            return { ...prev, type: "ACADEMIC", weeklyLectureHours: 0, weeklyLabHours: 3 };
                          } else {
                            return { ...prev, type: "TRAINING", weeklyLectureHours: 2, weeklyLabHours: 0 };
                          }
                        });
                      }}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="THEORY">Theory (Academic)</option>
                      <option value="LAB">Lab / Practical (Academic)</option>
                      <option value="TRAINING">Placement / Skills Training</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">Credits</label>
                      <input
                        type="number"
                        name="credits"
                        required
                        value={formData.credits !== undefined ? formData.credits : 3}
                        onChange={handleInputChange}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>
                    {/* Render Lecture Hours for Theory or Training */}
                    {(formData.weeklyLabHours === 0 || formData.weeklyLabHours === undefined) && (
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">Lecture Hrs/Wk</label>
                        <input
                          type="number"
                          name="weeklyLectureHours"
                          required
                          value={formData.weeklyLectureHours !== undefined ? formData.weeklyLectureHours : 3}
                          onChange={handleInputChange}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                    )}
                    {/* Render Lab Hours for Lab */}
                    {formData.weeklyLabHours > 0 && (
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">Lab Hours/Wk</label>
                        <input
                          type="number"
                          name="weeklyLabHours"
                          required
                          value={formData.weeklyLabHours !== undefined ? formData.weeklyLabHours : 3}
                          onChange={handleInputChange}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Target Branch & Year</label>
                    <select
                      name="yearId"
                      value={formData.yearId || ""}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {metadata.years.map((y: any) => (
                        <option key={y.id} value={y.id}>
                          {y.branch?.code} - Year {y.yearNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* FACULTY FORM */}
              {activeTab === "faculty" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Faculty Name</label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name || ""}
                      onChange={handleInputChange}
                      placeholder="e.g. Dr. Jane Smith"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Department</label>
                    <input
                      type="text"
                      name="department"
                      required
                      value={formData.department || ""}
                      onChange={handleInputChange}
                      placeholder="e.g. CSE"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Max Teaching Hours/Wk</label>
                    <input
                      type="number"
                      name="maxHoursPerWeek"
                      required
                      value={formData.maxHoursPerWeek || 16}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Faculty Source</label>
                    <select
                      name="source"
                      value={formData.source || "COLLEGE"}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="COLLEGE">COLLEGE</option>
                      <option value="TRAINING_DEPT">TRAINING_DEPT</option>
                    </select>
                  </div>
                </>
              )}

              {/* ROOMS FORM */}
              {activeTab === "rooms" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Room Name</label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name || ""}
                      onChange={handleInputChange}
                      placeholder="e.g. LH-101"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Room Type</label>
                    <select
                      name="type"
                      value={formData.type || "CLASSROOM"}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="CLASSROOM">CLASSROOM</option>
                      <option value="LAB">LAB</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Student Capacity</label>
                    <input
                      type="number"
                      name="capacity"
                      required
                      value={formData.capacity || 80}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                </>
              )}

              {/* TIMESLOTS FORM */}
              {activeTab === "timeslots" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Day of Week</label>
                    <select
                      name="day"
                      value={formData.day !== undefined ? formData.day : 0}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value={0}>Monday</option>
                      <option value={1}>Tuesday</option>
                      <option value={2}>Wednesday</option>
                      <option value={3}>Thursday</option>
                      <option value={4}>Friday</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Period Index</label>
                    <input
                      type="number"
                      name="slotIndex"
                      required
                      min={0}
                      max={7}
                      value={formData.slotIndex !== undefined ? formData.slotIndex : 0}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Start Time</label>
                      <input
                        type="text"
                        name="startTime"
                        required
                        value={formData.startTime || "09:00"}
                        onChange={handleInputChange}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">End Time</label>
                      <input
                        type="text"
                        name="endTime"
                        required
                        value={formData.endTime || "10:00"}
                        onChange={handleInputChange}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* FIXED ALLOCATIONS FORM */}
              {activeTab === "fixedallocations" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Training Subject</label>
                    <select
                      name="subjectId"
                      value={formData.subjectId || ""}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {metadata.subjects.filter((s: any) => s.type === "TRAINING").map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Training Faculty</label>
                    <select
                      name="facultyId"
                      value={formData.facultyId || ""}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {metadata.faculty.map((f: any) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.source})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Target Section</label>
                    <select
                      name="sectionId"
                      value={formData.sectionId || ""}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {metadata.sections.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Assigned Classroom / Lab</label>
                    <select
                      name="roomId"
                      value={formData.roomId || ""}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {metadata.rooms.map((r: any) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Locked TimeSlot</label>
                    <select
                      name="timeSlotId"
                      value={formData.timeSlotId || ""}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {metadata.timeslots.map((ts: any) => (
                        <option key={ts.id} value={ts.id}>
                          {getDayName(ts.day)} (Period {ts.slotIndex + 1} - {ts.startTime})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Consecutive Periods Duration</label>
                    <select
                      name="consecutiveLectures"
                      value={formData.consecutiveLectures !== undefined ? formData.consecutiveLectures : 1}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value={1}>1 Period (Single Lecture)</option>
                      <option value={2}>2 Periods (Double Lecture)</option>
                      <option value={3}>3 Periods (Triple Lecture)</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-3 pt-2">
                    <input
                      type="checkbox"
                      id="isLocked"
                      name="isLocked"
                      checked={formData.isLocked || false}
                      onChange={handleCheckboxChange}
                      className="h-4 w-4 rounded border-white/10 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <label htmlFor="isLocked" className="text-xs font-medium text-slate-300 select-none cursor-pointer">
                      Lock Allocation (Immovable by Scheduler)
                    </label>
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Training Fixed Allocation Conflict Modal */}
      {activeConflictReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5 animate-pulse" />
              <span>Training Fixed Allocation Conflict</span>
            </h3>
            <p className="text-xs text-slate-400 mt-2">
              The training slot you are trying to allocate overlaps with existing active class schedules:
            </p>

            <div className="mt-4 space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
              {activeConflictReport.conflicts.map((c: any) => (
                <div key={c.id} className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-xs space-y-1">
                  <div className="font-bold text-rose-300">{c.sectionName}</div>
                  <div className="text-slate-300">
                    <span className="font-semibold text-white">Subject:</span> {c.subjectName} | 
                    <span className="font-semibold text-white pl-1.5">Instructor:</span> {c.facultyName} |
                    <span className="font-semibold text-white pl-1.5">Room:</span> {c.roomName}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 mt-6 border-t border-white/5 pt-4">
              <div className="text-[11px] text-slate-400 leading-relaxed">
                Choose <strong className="text-indigo-400">Regenerate Affected Sections</strong> to write this fixed slot and automatically reschedule only the classes in the conflicting sections.
              </div>
              <div className="flex justify-end gap-3 mt-2">
                <button
                  onClick={() => setActiveConflictReport(null)}
                  className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const { formData, apiPath } = activeConflictReport;
                    try {
                      const res = await fetch(`/api/admin/${apiPath}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...formData, force: true }),
                      });
                      if (!res.ok) throw new Error("Force save failed.");
                      
                      showToast("Fixed allocation added successfully. Conflicting slots cleared.", "success");
                      setActiveConflictReport(null);
                      setIsModalOpen(false);
                      fetchAllData();
                    } catch (err: any) {
                      showToast(err.message || "Failed to force save.", "error");
                    }
                  }}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
                >
                  Force Save & Clear
                </button>
                <button
                  onClick={async () => {
                    const { formData, apiPath, conflicts } = activeConflictReport;
                    try {
                      const res = await fetch(`/api/admin/${apiPath}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...formData, force: true }),
                      });
                      if (!res.ok) throw new Error("Force save failed.");

                      const affectedSectionIds = Array.from(new Set(conflicts.map((c: any) => c.sectionId))) as string[];
                      
                      showToast("Running localized regeneration for affected sections...", "success");
                      setActiveConflictReport(null);
                      setIsModalOpen(false);

                      const genRes = await fetch("/api/generate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ targetSectionIds: affectedSectionIds })
                      });
                      
                      const genData = await genRes.json();
                      if (genRes.ok) {
                        showToast("Timetable for affected sections regenerated successfully!", "success");
                      } else {
                        showToast(genData.error || "Regeneration failed.", "error");
                      }
                      
                      fetchAllData();
                    } catch (err: any) {
                      showToast(err.message || "Failed to regenerate affected sections.", "error");
                    }
                  }}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 cursor-pointer animate-pulse"
                >
                  Regenerate Affected Sections
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center space-x-2.5 rounded-xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5">
          <div className={`h-2.5 w-2.5 rounded-full ${toast.type === "success" ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
          <span className="text-xs font-semibold text-slate-200">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
