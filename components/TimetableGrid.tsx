"use client";

import React, { useState } from "react";
import { Download, Edit2, Trash2, X, AlertCircle } from "lucide-react";

interface TimetableGridProps {
  slots: any[];
  metadata: {
    branches: any[];
    teachers: any[];
    rooms: any[];
  };
  selectedFilters: {
    branchId: string;
    year: string;
    section: string;
  };
  setSelectedFilters: React.Dispatch<React.SetStateAction<{
    branchId: string;
    year: string;
    section: string;
  }>>;
  onUpdateSlot: (slotId: string, data: { facultyId: string; roomId: string; subjectId: string }) => Promise<void>;
  onDeleteSlot: (slotId: string) => Promise<void>;
  onExport: (format: "xlsx" | "pdf", type: "section" | "all" | "faculty", facultyId?: string) => void;
}

export default function TimetableGrid({
  slots,
  metadata,
  selectedFilters,
  setSelectedFilters,
  onUpdateSlot,
  onDeleteSlot,
  onExport,
}: TimetableGridProps) {
  const [editingSlot, setEditingSlot] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    subjectId: "",
    facultyId: "",
    assistantFacultyId: "",
    roomId: "",
    timeSlotId: "",
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  React.useEffect(() => {
    if (!editingSlot) {
      setValidationError(null);
      setSuggestions([]);
      return;
    }

    const validateEdit = async () => {
      setIsValidating(true);
      try {
        const res = await fetch("/api/timetable/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingSlot.id,
            subjectId: editForm.subjectId,
            facultyId: editForm.facultyId,
            assistantFacultyId: editForm.assistantFacultyId || null,
            roomId: editForm.roomId,
            timeSlotId: editForm.timeSlotId || null,
          })
        });
        const data = await res.json();
        if (res.ok) {
          setValidationError(data.error);
          setSuggestions(data.suggestions || []);
        } else {
          setValidationError(data.error || "Failed to validate edit.");
          setSuggestions([]);
        }
      } catch (err) {
        console.error(err);
        setValidationError("Error connecting to validation engine.");
        setSuggestions([]);
      } finally {
        setIsValidating(false);
      }
    };

    const delay = setTimeout(validateEdit, 300);
    return () => clearTimeout(delay);
  }, [editForm.subjectId, editForm.facultyId, editForm.assistantFacultyId, editForm.roomId, editForm.timeSlotId, editingSlot]);

  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  // Find section details to get lunch index
  const branchObj = metadata.branches.find((b) => b.id === selectedFilters.branchId);
  const yearObj = branchObj?.years?.find((y: any) => y.yearNumber === Number(selectedFilters.year));
  const currentSection = yearObj?.sections?.find((s: any) => s.sectionName === selectedFilters.section);
  const lunchSlotIdx = currentSection?.lunchSlotIndex !== undefined ? currentSection.lunchSlotIndex : 4;

  const periods = [
    { label: "P1 (8:50-9:40)", idx: 0 },
    { label: "P2 (9:40-10:30)", idx: 1 },
    { label: "P3 (10:40-11:30)", idx: 2 },
    { label: "P4 (11:30-12:20)", idx: 3 },
    { label: "P5 (12:20-1:10)", idx: 4 },
    { label: "P6 (1:10-2:00)", idx: 5 },
    { label: "P7 (2:00-2:50)", idx: 6 },
    { label: "P8 (2:50-3:40)", idx: 7 },
    { label: "P9 (3:40-4:30)", idx: 8 },
  ].map(p => ({
    label: p.idx === lunchSlotIdx ? "LUNCH" : p.label,
    isLunch: p.idx === lunchSlotIdx,
    idx: p.idx
  }));

  // Helper to find all slots scheduled in this cell (can be multiple for split lab batches)
  const getSlotsForCell = (dayIdx: number, periodColIdx: number) => {
    if (periodColIdx === lunchSlotIdx) return [];
    
    return slots.filter((s) => {
      // Check day and period
      if (s.timeSlot.day !== dayIdx || s.timeSlot.slotIndex !== periodColIdx) {
        return false;
      }

      // Check section or batch section
      const section = s.section || s.labBatch?.section;
      if (!section) return false;

      return (
        section.year.branchId === selectedFilters.branchId &&
        section.year.yearNumber === Number(selectedFilters.year) &&
        section.sectionName === selectedFilters.section
      );
    });
  };

  // Find subjects for current branch and year
  const relevantSubjects = yearObj?.subjects || [];

  const handleEditClick = (slot: any) => {
    setEditingSlot(slot);
    setEditForm({
      subjectId: slot.subjectId,
      facultyId: slot.facultyId,
      assistantFacultyId: slot.assistantFacultyId || "",
      roomId: slot.roomId,
      timeSlotId: slot.timeSlotId || "",
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;
    await onUpdateSlot(editingSlot.id, editForm);
    setEditingSlot(null);
  };

  const handleDelete = async (slotId: string) => {
    if (window.confirm("Are you sure you want to clear this scheduled slot?")) {
      await onDeleteSlot(slotId);
      if (editingSlot?.id === slotId) {
        setEditingSlot(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/5 bg-slate-900/40 p-6 backdrop-blur-sm">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Branch</label>
            <select
              value={selectedFilters.branchId}
              onChange={(e) =>
                setSelectedFilters((prev) => ({ ...prev, branchId: e.target.value }))
              }
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {metadata.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} - {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Year</label>
            <select
              value={selectedFilters.year}
              onChange={(e) =>
                setSelectedFilters((prev) => ({ ...prev, year: e.target.value }))
              }
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Section</label>
            <select
              value={selectedFilters.section}
              onChange={(e) =>
                setSelectedFilters((prev) => ({ ...prev, section: e.target.value }))
              }
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="A">Section A</option>
              <option value="B">Section B</option>
            </select>
          </div>
        </div>

        {/* Exports */}
        <div className="flex flex-wrap gap-3 items-center justify-end self-end sm:self-center">
          {/* Single Section Exports */}
          <div className="flex items-center space-x-1.5 border border-white/5 bg-slate-900/40 p-1.5 rounded-xl">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2">Section</span>
            <button
              onClick={() => onExport("xlsx", "section")}
              className="flex items-center space-x-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
              title="Download current section Excel"
            >
              <span>XLSX</span>
            </button>
            <button
              onClick={() => onExport("pdf", "section")}
              className="flex items-center space-x-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition cursor-pointer"
              title="Download current section PDF"
            >
              <span>PDF</span>
            </button>
          </div>

          {/* All Sections Exports */}
          <div className="flex items-center space-x-1.5 border border-white/5 bg-slate-900/40 p-1.5 rounded-xl">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2">All Sections</span>
            <button
              onClick={() => onExport("pdf", "all")}
              className="flex items-center space-x-1 rounded-lg bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition cursor-pointer"
              title="Download all sections combined PDF"
            >
              <span>Combined PDF</span>
            </button>
          </div>

          {/* Faculty-wise Exports */}
          <div className="flex items-center space-x-1.5 border border-white/5 bg-slate-900/40 p-1.5 rounded-xl">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2">Faculty</span>
            <select
              id="exportFacultySelect"
              className="rounded-lg bg-slate-950 px-2 py-1 text-xs text-white focus:outline-none border border-white/10"
              defaultValue=""
            >
              <option value="">All Faculty</option>
              {metadata.teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const sel = document.getElementById("exportFacultySelect") as HTMLSelectElement;
                const facId = sel ? sel.value || undefined : undefined;
                onExport("xlsx", "faculty", facId);
              }}
              className="flex items-center space-x-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
              title="Download Faculty schedule Excel"
            >
              <span>XLSX</span>
            </button>
            <button
              onClick={() => {
                const sel = document.getElementById("exportFacultySelect") as HTMLSelectElement;
                const facId = sel ? sel.value || undefined : undefined;
                onExport("pdf", "faculty", facId);
              }}
              className="flex items-center space-x-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition cursor-pointer"
              title="Download Faculty schedule PDF"
            >
              <span>PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid view */}
      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-slate-900/20 shadow-xl backdrop-blur-sm">
        <table className="w-full min-w-[850px] border-collapse text-left">
          <thead>
            <tr className="border-b border-white/5 bg-slate-900/60">
              <th className="p-4 text-xs font-semibold text-slate-400 w-24">Day</th>
              {periods.map((p, idx) => (
                <th
                  key={idx}
                  className={`p-4 text-center text-xs font-semibold ${
                    p.isLunch ? "text-slate-500 bg-slate-950/10" : "text-slate-400"
                  }`}
                >
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {daysOfWeek.map((dayName, dayIdx) => (
              <tr key={dayIdx} className="hover:bg-slate-900/10">
                <td className="p-4 text-sm font-bold text-slate-200 bg-slate-900/30">{dayName}</td>
                {periods.map((p, periodIdx) => {
                  if (p.isLunch) {
                    return (
                      <td
                        key={periodIdx}
                        className="p-2 text-center text-xs font-bold font-mono tracking-widest text-slate-600 bg-slate-950/40 select-none align-middle"
                      >
                        LUNCH
                      </td>
                    );
                  }

                  const cellSlots = getSlotsForCell(dayIdx, periodIdx);
                  return (
                    <td key={periodIdx} className="p-2 align-middle">
                      {cellSlots.length > 0 ? (
                        <div className="space-y-1.5 max-w-[155px]">
                          {cellSlots.map((slot) => (
                            <div 
                              key={slot.id}
                              className={`group relative flex flex-col justify-between rounded-xl p-2.5 border text-center transition-all ${
                                slot.subject.isLab || slot.labBatch
                                  ? "bg-teal-500/10 hover:bg-teal-500/15 border-teal-500/25" 
                                  : "bg-indigo-500/10 hover:bg-indigo-500/15 border-indigo-500/25"
                              }`}
                            >
                              <div className="text-[10px] font-bold text-white leading-tight">
                                {slot.labBatch ? `[${slot.labBatch.name}] ` : ""}
                                {slot.subject.code}
                              </div>
                              <div className="mt-0.5 text-[9px] text-slate-300 font-medium truncate max-w-[130px] mx-auto">
                                {slot.subject.name}
                              </div>
                              <div className="mt-0.5 flex items-center justify-center flex-wrap gap-1 text-[8px] text-slate-500 font-mono">
                                <span className="truncate max-w-[120px]" title={slot.faculty.name}>{slot.faculty.name}</span>
                                {slot.assistantFaculty && (
                                  <>
                                    <span>+</span>
                                    <span className="truncate max-w-[120px] text-indigo-400" title={slot.assistantFaculty.name}>{slot.assistantFaculty.name}</span>
                                  </>
                                )}
                                <span>•</span>
                                <span className="font-semibold text-slate-400">{slot.room.name}</span>
                              </div>

                              {/* Hover action overlay */}
                              <div className="absolute inset-0 flex items-center justify-center space-x-2 rounded-xl bg-slate-950/90 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleEditClick(slot)}
                                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                                  title="Edit slot"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(slot.id)}
                                  className="rounded-lg p-1 text-red-400 hover:bg-slate-800 hover:text-red-300"
                                  title="Delete slot"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/5 bg-slate-950/10 py-5 text-center text-[10px] text-slate-600 font-mono">
                          Free
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog Modal */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Modify Scheduled Period</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {daysOfWeek[editingSlot.timeSlot.day]} • Period {editingSlot.timeSlot.slotIndex + 1}
                  {editingSlot.labBatch ? ` (${editingSlot.labBatch.name})` : ""}
                </p>
              </div>
              <button
                onClick={() => setEditingSlot(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Subject / Course</label>
                <select
                  value={editForm.subjectId}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, subjectId: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {relevantSubjects.map((sub: any) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.code} - {sub.name} ({sub.weeklyLectureHours > 0 ? "Lecture" : "Lab"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Assigned Faculty</label>
                <select
                  value={editForm.facultyId}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, facultyId: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {metadata.teachers.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.department})
                    </option>
                  ))}
                </select>
              </div>

              {/* Show Assistant Faculty Dropdown for Lab Courses */}
              {(() => {
                const sub = relevantSubjects.find((s: any) => s.id === editForm.subjectId);
                const isLabSubject = sub && (sub.weeklyLabHours > 0 || sub.type === "LAB");
                if (!isLabSubject) return null;
                return (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Assistant Faculty</label>
                    <select
                      value={editForm.assistantFacultyId}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, assistantFacultyId: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Select Assistant Faculty</option>
                      {metadata.teachers.filter((t: any) => t.id !== editForm.facultyId).map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.department})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Assigned Room</label>
                <select
                  value={editForm.roomId}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, roomId: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {metadata.rooms.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.type}, Cap: {r.capacity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-3 rounded-lg bg-indigo-500/5 p-3 text-[11px] text-indigo-400 border border-indigo-500/10">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  Modifying this slot manually will write the changes directly to the database.
                </span>
              </div>

              {isValidating && (
                <div className="text-[11px] text-indigo-400 animate-pulse pl-1 flex items-center space-x-1.5">
                  <span>Validating conflicts...</span>
                </div>
              )}

              {validationError && (
                <div className="flex items-start space-x-3 rounded-lg bg-rose-500/10 p-3 text-[11px] text-rose-400 border border-rose-500/20">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{validationError}</span>
                </div>
              )}

              {validationError && suggestions && suggestions.length > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 space-y-1.5 animate-in fade-in duration-200">
                  <span className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Suggested Conflict-Free Timeslots:</span>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {suggestions.map((s: any) => (
                      <button
                        key={s.timeSlotId}
                        type="button"
                        onClick={() => {
                          setEditForm(prev => ({ ...prev, timeSlotId: s.timeSlotId }));
                        }}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition cursor-pointer ${
                          editForm.timeSlotId === s.timeSlotId
                            ? "bg-emerald-500 text-slate-950 font-bold"
                            : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        }`}
                      >
                        {daysOfWeek[s.day]} P{s.slotIndex + 1}
                      </button>
                    ))}
                  </div>
                  <span className="block text-[9px] text-slate-500 italic mt-0.5">Click a suggestion to reschedule the period to that time.</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => handleDelete(editingSlot.id)}
                  className="flex items-center space-x-1 text-sm font-semibold text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Slot</span>
                </button>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditingSlot(null)}
                    className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={validationError !== null || isValidating}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 cursor-pointer ${
                      validationError !== null || isValidating
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed shadow-none border border-white/5"
                        : "bg-indigo-600 hover:bg-indigo-500"
                    }`}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
