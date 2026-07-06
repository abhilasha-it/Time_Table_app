"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Layers, GraduationCap, Users } from "lucide-react";

interface SectionTreeViewProps {
  branches: any[];
  selectedFilters: {
    branchId: string;
    year: string;
    section: string;
  };
  onSelectSection: (branchId: string, year: string, section: string) => void;
}

export default function SectionTreeView({
  branches = [],
  selectedFilters,
  onSelectSection,
}: SectionTreeViewProps) {
  // Store expanded branch IDs (default expand the first branch)
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>(() => {
    if (branches.length > 0) {
      return { [branches[0].id]: true };
    }
    return {};
  });

  const toggleBranch = (branchId: string) => {
    setExpandedBranches((prev) => ({
      ...prev,
      [branchId]: !prev[branchId]
    }));
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 shadow-xl backdrop-blur-sm space-y-3">
      <div className="flex items-center space-x-1.5 border-b border-white/5 pb-2">
        <Layers className="h-4 w-4 text-indigo-400" />
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Academic Directory</h4>
      </div>

      <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
        {branches.length === 0 ? (
          <div className="text-[11px] text-slate-500 italic py-4 text-center">
            No branch metadata registered.
          </div>
        ) : (
          branches.map((branch) => {
            const isBranchExpanded = !!expandedBranches[branch.id];
            const isBranchActive = selectedFilters.branchId === branch.id;
            
            return (
              <div key={branch.id} className="space-y-0.5">
                {/* Branch Node */}
                <button
                  onClick={() => toggleBranch(branch.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition cursor-pointer ${
                    isBranchActive 
                      ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/15" 
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    {isBranchExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                    )}
                    <span>{branch.code}</span>
                    <span className="text-[10px] text-slate-500 font-normal truncate hidden sm:inline">
                      ({branch.name})
                    </span>
                  </div>
                </button>

                {/* Years Nest */}
                {isBranchExpanded && (
                  <div className="pl-4 border-l border-white/5 ml-4 space-y-0.5">
                    {(branch.years || []).map((yr: any) => {
                      const isYearActive = isBranchActive && Number(selectedFilters.year) === yr.yearNumber;
                      
                      return (
                        <div key={yr.id} className="space-y-0.5">
                          {/* Year label node */}
                          <div className={`flex items-center space-x-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500`}>
                            <GraduationCap className="h-3 w-3" />
                            <span>Year {yr.yearNumber}</span>
                          </div>

                          {/* Sections Nest */}
                          <div className="pl-2 space-y-0.5">
                            {yr.sections?.length === 0 ? (
                              <div className="text-[9px] text-slate-600 italic px-2 py-0.5">
                                No sections
                              </div>
                            ) : (
                              yr.sections?.map((sec: any) => {
                                const isSecActive = isYearActive && selectedFilters.section === sec.sectionName;
                                
                                return (
                                  <button
                                    key={sec.id}
                                    onClick={() => onSelectSection(branch.id, String(yr.yearNumber), sec.sectionName)}
                                    className={`flex w-full items-center space-x-1.5 rounded-md px-3 py-1 text-left text-xs transition cursor-pointer ${
                                      isSecActive
                                        ? "bg-indigo-600 text-white font-semibold"
                                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                    }`}
                                  >
                                    <Users className="h-3 w-3 shrink-0" />
                                    <span>Section {sec.sectionName}</span>
                                    <span className="text-[9px] text-slate-500 font-normal ml-auto">
                                      ({sec.strength} stds)
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
