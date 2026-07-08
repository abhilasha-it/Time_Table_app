"use client";

import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, AlertTriangle, RefreshCw, Layers, ArrowRight, 
  CheckCircle, Info, HelpCircle 
} from "lucide-react";

interface YearlySchedulerProps {
  metadata: {
    branches: any[];
    years: any[];
    sections: any[];
    subjects: any[];
    faculty: any[];
    rooms: any[];
    timeslots: any[];
  };
  onSuccess: () => void;
  selectedYearId: string;
  setSelectedYearId: (id: string) => void;
}

export default function YearlyScheduler({ 
  metadata, 
  onSuccess,
  selectedYearId,
  setSelectedYearId
}: YearlySchedulerProps) {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<any>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [solvingProgress, setSolvingProgress] = useState(0);
  const [solvedEntries, setSolvedEntries] = useState<any[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [selectedReschedSections, setSelectedReschedSections] = useState<string[]>([]);

  // Drag and Drop Swapping state
  const [draggedSlotId, setDraggedSlotId] = useState<string | null>(null);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{ slotId: string; timeSlotId: string } | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");

  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Automatically fetch audit report when selected year changes
  useEffect(() => {
    if (selectedYearId) {
      runCapacityAudit();
      fetchYearTimetable();
      setSelectedReschedSections([]); // Reset section filters
    } else {
      setAuditReport(null);
      setSolvedEntries([]);
      setSelectedReschedSections([]);
    }
  }, [selectedYearId]);

  const runCapacityAudit = async () => {
    setIsAuditing(true);
    try {
      const res = await fetch(`/api/generate/validate?targetYearId=${selectedYearId}`);
      if (res.ok) {
        const data = await res.json();
        setAuditReport(data);
      }
    } catch (error) {
      console.error("Year audit failed:", error);
    } finally {
      setIsAuditing(false);
    }
  };

  const fetchYearTimetable = async () => {
    try {
      const res = await fetch("/api/timetable");
      if (res.ok) {
        const data = await res.json();
        // Filter entries belonging to target year sections or batches
        const filtered = data.filter((entry: any) => {
          const sec = entry.section || entry.labBatch?.section;
          return sec && sec.yearId === selectedYearId;
        });
        setSolvedEntries(filtered);
      }
    } catch (error) {
      console.error("Error fetching timetable:", error);
    }
  };

  const handleGenerateYearly = async () => {
    if (!selectedYearId) return;
    setIsSolving(true);
    setSolvingProgress(15);
    
    // Simulate solver phases
    const interval = setInterval(() => {
      setSolvingProgress((prev) => (prev < 90 ? prev + 15 : prev));
    }, 400);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          targetYearId: selectedYearId,
          targetSectionIds: selectedReschedSections.length > 0 ? selectedReschedSections : undefined
        })
      });

      clearInterval(interval);
      setSolvingProgress(100);

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to schedule year timetable.", "error");
      } else {
        showToast(`Year schedule generated successfully! scheduled ${data.slotsScheduled} slots.`, "success");
        await fetchYearTimetable();
        onSuccess();
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      showToast("Network error running scheduler.", "error");
    } finally {
      setTimeout(() => {
        setIsSolving(false);
        setSolvingProgress(0);
      }, 500);
    }
  };

  // --- DRAG AND DROP SWAPPING ---

  const handleDragStart = (e: React.DragEvent, slotId: string) => {
    e.dataTransfer.setData("text/plain", slotId);
    setDraggedSlotId(slotId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetTimeSlotId: string, cellEntries: any[]) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain") || draggedSlotId;
    if (!sourceId) return;

    // Reset dragged state
    setDraggedSlotId(null);

    // If source and target are same slot, skip
    if (cellEntries.some(e => e.id === sourceId)) return;

    if (cellEntries.length > 0) {
      // SWAP CASE: swap source entry with the first entry in target cell
      const targetEntry = cellEntries[0];
      if (confirm(`Do you want to swap schedule positions between course '${targetEntry.subject.code}' and source course?`)) {
        await executeSwap({ action: "swap", idA: sourceId, idB: targetEntry.id });
      }
    } else {
      // MOVE CASE: move source entry to empty slot
      const sourceEntry = solvedEntries.find(e => e.id === sourceId);
      if (!sourceEntry) return;

      setMoveTarget({ slotId: sourceId, timeSlotId: targetTimeSlotId });
      
      // Auto select first room of matching type that is free in this timeslot
      const isLab = sourceEntry.subject.weeklyLabHours > 0 || sourceEntry.labBatchId !== null;
      const typeRequired = isLab ? "LAB" : "CLASSROOM";
      const matchingRooms = metadata.rooms.filter(r => r.type === typeRequired);
      
      if (matchingRooms.length > 0) {
        setSelectedRoomId(matchingRooms[0].id);
        setShowRoomModal(true);
      } else {
        showToast("No compatible rooms found for this subject type.", "error");
      }
    }
  };

  const executeSwap = async (payload: any) => {
    try {
      const res = await fetch("/api/timetable/swap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Swap rejected due to conflict.", "error");
      } else {
        showToast(data.message || "Schedules adjusted successfully!", "success");
        await fetchYearTimetable();
        onSuccess();
      }
    } catch (err: any) {
      console.error(err);
      showToast("Failed to connect to swap editor API.", "error");
    }
  };

  const handleConfirmMove = async () => {
    if (!moveTarget || !selectedRoomId) return;
    setShowRoomModal(false);
    
    await executeSwap({
      action: "move",
      idA: moveTarget.slotId,
      timeSlotId: moveTarget.timeSlotId,
      roomId: selectedRoomId
    });

    setMoveTarget(null);
  };

  // --- SOFT CONSTRAINTS EVALUATIONS ---

  const checkSoftConstraints = (secSlots: any[], dayIdx: number) => {
    const warnings: string[] = [];
    const daySlots = secSlots.filter(s => s.timeSlot.day === dayIdx).sort((a,b) => a.timeSlot.slotIndex - b.timeSlot.slotIndex);
    if (daySlots.length === 0) return warnings;

    // 1. Check for > 2 consecutive lecture hours of same subject
    for (let i = 0; i < daySlots.length - 2; i++) {
      const s1 = daySlots[i];
      const s2 = daySlots[i+1];
      const s3 = daySlots[i+2];

      const consecutive = s1.subjectId === s2.subjectId && s2.subjectId === s3.subjectId;
      const isLecture = !s1.subject.weeklyLabHours;

      if (consecutive && isLecture) {
        warnings.push(`More than 2 consecutive hours of '${s1.subject.code}' lecture scheduled.`);
        break;
      }
    }

    // 2. Check for idle gaps (e.g. Class P1, Free P2, Class P3)
    const indices = daySlots.map(s => s.timeSlot.slotIndex);
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);

    if (maxIdx - minIdx > daySlots.length - 1) {
      for (let idx = minIdx; idx <= maxIdx; idx++) {
        const isLunch = idx === 4; // Period index 4 is LUNCH
        const isScheduled = indices.includes(idx);
        
        if (!isScheduled && !isLunch) {
          warnings.push("Idle gap detected in the daily schedule.");
          break;
        }
      }
    }

    return warnings;
  };

  // Get active sections for selected year
  const activeSections = metadata.sections.filter(s => s.yearId === selectedYearId);

  // Helper to find slots in cell
  const getSlotsForCell = (secId: string, dayIdx: number, slotIndex: number, lunchSlotIndex: number) => {
    if (slotIndex === lunchSlotIndex) return [];
    
    return solvedEntries.filter((s) => {
      if (s.timeSlot.day !== dayIdx || s.timeSlot.slotIndex !== slotIndex) {
        return false;
      }
      const section = s.section || s.labBatch?.section;
      return section?.id === secId;
    });
  };

  return (
    <div className="space-y-6">
      {/* Selector and Generator controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Target Academic Year</label>
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="">-- Choose Branch and Year --</option>
            {metadata.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.branch?.code} - Year {y.yearNumber}
              </option>
            ))}
          </select>
        </div>

        {selectedYearId && activeSections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border border-white/5 bg-slate-900/40 p-2.5 rounded-xl text-xs">
            <span className="font-bold text-slate-400 mr-2 uppercase tracking-wider text-[10px]">Filter Reschedule Sections:</span>
            {activeSections.map((sec: any) => {
              const isChecked = selectedReschedSections.includes(sec.id);
              return (
                <label 
                  key={sec.id} 
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg border cursor-pointer transition select-none ${
                    isChecked 
                      ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300 font-bold" 
                      : "bg-slate-950 border-white/5 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedReschedSections(prev => [...prev, sec.id]);
                      } else {
                        setSelectedReschedSections(prev => prev.filter(id => id !== sec.id));
                      }
                    }}
                  />
                  <span>Section {sec.sectionName}</span>
                </label>
              );
            })}
            {selectedReschedSections.length > 0 && (
              <button
                onClick={() => setSelectedReschedSections([])}
                className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold ml-2"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {selectedYearId && auditReport && (
          <button
            onClick={handleGenerateYearly}
            disabled={isSolving}
            className={`flex items-center space-x-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition cursor-pointer ${
              !auditReport.isFeasible 
                ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20" 
                : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20"
            } disabled:opacity-50 disabled:pointer-events-none`}
          >
            {isSolving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}
            <span>
              {!auditReport.isFeasible ? "Force Generate (Acknowledge Warning)" : 
                (selectedReschedSections.length > 0 
                  ? `Regenerate Section ${selectedReschedSections.map(id => activeSections.find(s => s.id === id)?.sectionName).join('&')}` 
                  : "Generate Year Schedule")}
            </span>
          </button>
        )}
      </div>

      {/* Solver Progress bar */}
      {isSolving && (
        <div className="rounded-xl border border-indigo-500/20 bg-slate-950/40 p-4 space-y-2">
          <div className="flex justify-between text-xs font-semibold text-indigo-400">
            <span>Running backtracking solver...</span>
            <span>{solvingProgress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div 
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${solvingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Preflight audit report */}
      {selectedYearId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {isAuditing ? (
            <div className="lg:col-span-3 rounded-xl border border-white/5 bg-slate-950/20 py-8 text-center">
              <RefreshCw className="h-5 w-5 animate-spin text-slate-500 mx-auto" />
              <p className="text-xs text-slate-400 mt-2">Checking classroom availability...</p>
            </div>
          ) : auditReport ? (
            <div className={`lg:col-span-3 rounded-xl border p-5 flex flex-col md:flex-row gap-5 items-start justify-between ${
              auditReport.isFeasible ? "border-emerald-500/20 bg-emerald-950/5" : "border-rose-500/20 bg-rose-950/5"
            }`}>
              <div className="space-y-2 max-w-lg">
                <div className="flex items-center space-x-2">
                  {auditReport.isFeasible ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-rose-400" />
                  )}
                  <h4 className="text-sm font-bold text-white">
                    {auditReport.isFeasible ? "Audit Approved: Resources Sufficient" : "Audit Failed: Capacity Deficit"}
                  </h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {auditReport.isFeasible 
                    ? "Classroom and Lab hours meet the demand of this year's courses. Other years' locked slots are successfully reserved." 
                    : `Infrastructure limits exceeded. You can proceed with generation, but the solver may not be able to schedule all sessions.`
                  }
                </p>
                {auditReport.warnings.map((w: string, i: number) => (
                  <p key={i} className="text-xs text-rose-300 font-medium font-mono">• {w}</p>
                ))}

                {!auditReport.isFeasible && (
                  <div className="mt-3.5 space-y-2 border-t border-rose-500/10 pt-3">
                    <h5 className="text-[10px] font-bold text-white uppercase tracking-wider">Suggested Actions to Resolve Deficits:</h5>
                    <ul className="list-disc pl-4 text-[11px] text-slate-400 space-y-1">
                      <li>
                        <strong className="text-amber-400">Extend Working Hours:</strong> Add more daily periods or enable Saturday classes in the directory.
                      </li>
                      <li>
                        <strong className="text-amber-400">Introduce a Second Shift:</strong> Schedule some branches or sections during an afternoon shift.
                      </li>
                      <li>
                        <strong className="text-amber-400">Merge Sections for Common Subjects:</strong> Combine theory lectures for different sections into one classroom.
                      </li>
                      <li>
                        <strong className="text-amber-400">Add Infrastructure:</strong> Register new classrooms or labs in the Room Directory.
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Progress utilization stats */}
              <div className="flex gap-4 shrink-0 font-mono text-xs w-full md:w-auto">
                <div className="rounded-lg bg-slate-950/50 p-3 border border-white/5 flex-1 md:flex-initial">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Lectures</div>
                  <div className="text-sm font-bold text-white mt-1">
                    {auditReport.classroom.required} / {auditReport.classroom.available} hrs
                  </div>
                  <span className={`text-[9px] ${auditReport.classroom.isFeasible ? "text-indigo-400" : "text-rose-400"}`}>
                    {Math.round((auditReport.classroom.required / auditReport.classroom.available) * 100)}% Cap
                  </span>
                </div>
                <div className="rounded-lg bg-slate-950/50 p-3 border border-white/5 flex-1 md:flex-initial">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Labs</div>
                  <div className="text-sm font-bold text-white mt-1">
                    {auditReport.lab.required} / {auditReport.lab.available} hrs
                  </div>
                  <span className={`text-[9px] ${auditReport.lab.isFeasible ? "text-teal-400" : "text-rose-400"}`}>
                    {Math.round((auditReport.lab.required / auditReport.lab.available) * 100)}% Cap
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Timetable visual grids */}
      {selectedYearId && solvedEntries.length > 0 && (
        <div className="space-y-8 pt-4">
          <div className="border-b border-white/5 pb-2">
            <h4 className="text-sm font-bold text-white">Generated Schedules Preview</h4>
            <p className="text-xs text-slate-500">Drag-and-drop slots to edit or swap records. Amber icons represent soft-constraint violations.</p>
          </div>

          {activeSections.map((sec) => {
            const secLunchSlotIdx = sec.lunchSlotIndex !== undefined ? sec.lunchSlotIndex : 4;
            const secPeriods = [
              { label: "P1", idx: 0 },
              { label: "P2", idx: 1 },
              { label: "P3", idx: 2 },
              { label: "P4", idx: 3 },
              { label: "P5", idx: 4 },
              { label: "P6", idx: 5 },
              { label: "P7", idx: 6 },
              { label: "P8", idx: 7 },
              { label: "P9", idx: 8 },
            ].map(p => ({
              label: p.idx === secLunchSlotIdx ? "LUNCH" : p.label,
              isLunch: p.idx === secLunchSlotIdx,
              idx: p.idx
            }));

            return (
              <div key={sec.id} className="space-y-3 rounded-2xl border border-white/5 bg-slate-950/10 p-5">
                <div className="flex justify-between items-center px-1">
                  <span className="text-sm font-bold text-white">Section {sec.sectionName}</span>
                  <span className="text-[11px] text-slate-500 font-mono">Section Strength: {sec.strength} stds</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/5 bg-slate-900/10">
                  <table className="w-full min-w-[850px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/5 bg-slate-900/60 font-semibold text-slate-400">
                        <th className="p-3 w-20">Day</th>
                        {secPeriods.map((p, idx) => (
                          <th key={idx} className={`p-3 text-center ${p.isLunch ? "text-slate-500 font-bold" : ""}`}>
                            {p.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {daysOfWeek.map((dayName, dayIdx) => {
                        const softWarnings = checkSoftConstraints(
                          solvedEntries.filter(s => {
                            const section = s.section || s.labBatch?.section;
                            return section?.id === sec.id;
                          }),
                          dayIdx
                        );

                        return (
                          <tr key={dayIdx} className="hover:bg-slate-900/5">
                            <td className="p-3 font-bold text-slate-300 bg-slate-900/20 relative">
                              {dayName}
                              {softWarnings.length > 0 && (
                                <span 
                                  className="absolute top-1 right-1 text-amber-500 hover:text-amber-400 cursor-help"
                                  title={softWarnings.join("\n")}
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </td>
                            {secPeriods.map((p, periodIdx) => {
                              if (p.isLunch) {
                                return (
                                  <td key={periodIdx} className="p-2 text-center text-[10px] font-bold font-mono tracking-widest text-slate-700 bg-slate-950/40 select-none align-middle">
                                    LUNCH
                                  </td>
                                );
                              }

                              const cellSlots = getSlotsForCell(sec.id, dayIdx, p.idx, secLunchSlotIdx);
                              return (
                                <td
                                  key={periodIdx}
                                  onDragOver={handleDragOver}
                                  onDrop={(e) => handleDrop(e, metadata.timeslots.find(t => t.day === dayIdx && t.slotIndex === p.idx)?.id, cellSlots)}
                                  className="p-1.5 align-middle min-h-[55px] border-r border-white/5"
                                >
                                  {cellSlots.length > 0 ? (
                                    <div className="space-y-1">
                                      {cellSlots.map((slot) => {
                                        const isTraining = slot.subject.type === "TRAINING";
                                        return (
                                          <div
                                            key={slot.id}
                                            draggable={true}
                                            onDragStart={(e) => handleDragStart(e, slot.id)}
                                            className={`flex flex-col justify-between rounded-lg p-2 border text-center transition-all cursor-grab active:cursor-grabbing ${
                                              isTraining
                                                ? "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/15"
                                                : slot.subject.weeklyLabHours > 0 || slot.labBatch
                                                  ? "bg-teal-500/10 border-teal-500/25 hover:bg-teal-500/15"
                                                  : "bg-indigo-500/10 border-indigo-500/25 hover:bg-indigo-500/15"
                                            }`}
                                          >
                                            <div className="text-[9px] font-bold text-white leading-none flex justify-center items-center gap-1">
                                              {isTraining && <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-400" />}
                                              {slot.labBatch ? `[${slot.labBatch.name}] ` : ""}
                                              {slot.subject.code}
                                            </div>
                                            <div className="mt-0.5 text-[8px] text-slate-400 font-mono truncate" title={slot.faculty.name}>
                                              {slot.faculty.name} • <span className="font-semibold text-slate-300">{slot.room.name}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="h-9 border border-dashed border-white/5 rounded-lg flex items-center justify-center text-[9px] text-slate-700 font-mono">
                                      Free
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Room Occupancy selector Modal for move operations */}
      {showRoomModal && moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-white border-b border-white/5 pb-2">Select Target Room</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Moving schedule entry to a new time slot. Choose an available infrastructure room for this session:
            </p>

            <div className="my-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Available Rooms</label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {metadata.rooms.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.type}, Cap: {r.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => {
                  setShowRoomModal(false);
                  setMoveTarget(null);
                }}
                className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMove}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                Confirm Move
              </button>
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
