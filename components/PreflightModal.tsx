"use client";

import React, { useState, useEffect } from "react";
import { 
  X, AlertTriangle, CheckCircle, RefreshCw, HelpCircle, ArrowRight, ShieldAlert, Award
} from "lucide-react";
import Link from "next/link";

interface PreflightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  isGenerating: boolean;
}

export default function PreflightModal({
  isOpen,
  onClose,
  onProceed,
  isGenerating,
}: PreflightModalProps) {
  const [audit, setAudit] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);

  const fetchAuditData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/generate/validate");
      if (res.ok) {
        const data = await res.json();
        setAudit(data);
      }
    } catch (error) {
      console.error("Failed to load pre-flight validation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAuditData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getClassroomPercent = () => {
    if (!audit?.classroom) return 0;
    return Math.round((audit.classroom.required / audit.classroom.available) * 100);
  };

  const getLabPercent = () => {
    if (!audit?.lab) return 0;
    return Math.round((audit.lab.required / audit.lab.available) * 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 bg-slate-950/40 px-6 py-4">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="h-5 w-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">Pre-Flight Resource Audit</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
              <p className="text-sm text-slate-400">Auditing room capacities and curricular workloads...</p>
            </div>
          ) : !audit ? (
            <div className="py-8 text-center text-red-400 text-sm">
              Failed to load resource capacity audit.
            </div>
          ) : (
            <>
              {/* Feasibility Banner */}
              {audit.isFeasible ? (
                <div className="flex items-start space-x-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-5">
                  <CheckCircle className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-400">Resource Feasibility Cleared</h4>
                    <p className="text-xs text-emerald-200/60 mt-1 leading-relaxed">
                      All sections can fit into the available classroom and lab slots! The solver will run under safe capacity bounds.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start space-x-3.5 rounded-xl border border-rose-500/20 bg-rose-950/25 p-5">
                  <AlertTriangle className="h-6 w-6 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-rose-400">Resource Capacity Deficit Detected</h4>
                    <p className="text-xs text-rose-200/60 mt-1 leading-relaxed">
                      Timetable generation is locked. The demand for classroom or laboratory slots exceeds your available room hours, which mathematically prevents a conflict-free solution.
                    </p>
                  </div>
                </div>
              )}

              {/* Progress bars comparing supply vs demand */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                
                {/* Classroom Utilization */}
                <div className="rounded-xl border border-white/5 bg-slate-950/30 p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="text-sm font-bold text-white">Classrooms (Lectures)</h5>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {audit.classroom.roomsCount} Rooms × {audit.totalSlots} Periods
                      </p>
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-mono font-bold ${
                      audit.classroom.isFeasible ? "bg-indigo-500/10 text-indigo-400" : "bg-rose-500/10 text-rose-400"
                    }`}>
                      {getClassroomPercent()}% Used
                    </span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        audit.classroom.isFeasible ? "bg-indigo-500" : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.min(getClassroomPercent(), 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs font-mono text-slate-400 pt-1">
                    <span>Demand: <strong className="text-white">{audit.classroom.required}</strong> hrs</span>
                    <span>Supply: <strong className="text-white">{audit.classroom.available}</strong> hrs</span>
                  </div>
                </div>

                {/* Lab Utilization */}
                <div className="rounded-xl border border-white/5 bg-slate-950/30 p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="text-sm font-bold text-white">Laboratories (Labs)</h5>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {audit.lab.roomsCount} Labs × {audit.totalSlots} Periods
                      </p>
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-mono font-bold ${
                      audit.lab.isFeasible ? "bg-teal-500/10 text-teal-400" : "bg-rose-500/10 text-rose-400"
                    }`}>
                      {getLabPercent()}% Used
                    </span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        audit.lab.isFeasible ? "bg-teal-500" : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.min(getLabPercent(), 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs font-mono text-slate-400 pt-1">
                    <span>Demand: <strong className="text-white">{audit.lab.required}</strong> hrs</span>
                    <span>Supply: <strong className="text-white">{audit.lab.available}</strong> hrs</span>
                  </div>
                </div>

              </div>

              {/* Warning Diagnostics */}
              {audit.warnings.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Diagnostic Warnings</h5>
                  <div className="space-y-2">
                    {audit.warnings.map((w: string, idx: number) => (
                      <div key={idx} className="flex items-start space-x-2 text-xs text-rose-200/70 bg-rose-950/10 rounded-xl p-3 border border-rose-500/10">
                        <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actionable Recommendations */}
              {!audit.isFeasible && audit.suggestions?.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Actionable Recommendations for Admin
                  </h5>
                  
                  <div className="rounded-xl border border-white/5 bg-slate-950/20 overflow-hidden">
                    {/* Recommendation Tabs */}
                    <div className="flex border-b border-white/5 bg-slate-950/40 overflow-x-auto">
                      {audit.suggestions.map((s: any, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveSuggestionIdx(idx)}
                          className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                            activeSuggestionIdx === idx
                              ? "border-indigo-500 text-indigo-400 bg-slate-900/40"
                              : "border-transparent text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {s.title}
                        </button>
                      ))}
                    </div>

                    {/* Recommendation Description */}
                    <div className="p-4 space-y-4">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {audit.suggestions[activeSuggestionIdx]?.desc}
                      </p>
                      
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-[10px] text-slate-500 font-medium">
                          Adjust parameters in the Admin Panel.
                        </span>
                        <Link
                          href="/admin"
                          onClick={onClose}
                          className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          <span>Go to Admin Panel</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 border-t border-white/5 bg-slate-950/40 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 cursor-pointer"
          >
            Close
          </button>
          
          <button
            type="button"
            disabled={isGenerating || !audit?.isFeasible}
            onClick={() => {
              onProceed();
              onClose();
            }}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500 shadow-indigo-600/20 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {isGenerating ? "Generating..." : "Proceed to Auto-Schedule"}
          </button>
        </div>

      </div>
    </div>
  );
}
