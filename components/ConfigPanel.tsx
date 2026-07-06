"use client";

import React, { useState } from "react";
import { Layers, Users, Home, BookOpen } from "lucide-react";

interface ConfigPanelProps {
  metadata: {
    branches: any[];
    teachers: any[];
    rooms: any[];
  };
}

type TabType = "branches" | "teachers" | "rooms" | "subjects";

export default function ConfigPanel({ metadata }: ConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("branches");

  const tabs = [
    { id: "branches", name: "Branches", icon: Layers },
    { id: "teachers", name: "Faculty", icon: Users },
    { id: "rooms", name: "Classrooms", icon: Home },
    { id: "subjects", name: "Subjects", icon: BookOpen },
  ];

  // Flatten all subjects from branches (through branch -> years -> subjects) for the Subjects tab
  const allSubjects = (metadata.branches || []).flatMap((branch) =>
    (branch.years || []).flatMap((year: any) =>
      (year.subjects || []).map((sub: any) => ({
        ...sub,
        branchCode: branch.code,
        yearNumber: year.yearNumber,
      }))
    )
  );

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 shadow-xl backdrop-blur-sm">
      {/* Tab Navigation */}
      <div className="border-b border-white/5 px-4 pt-2">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`group flex items-center space-x-2 border-b-2 py-4 px-1 text-sm font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : "text-slate-400 group-hover:text-slate-200"}`} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Contents */}
      <div className="max-h-[500px] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800">
        {/* Branches Tab */}
        {activeTab === "branches" && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white">Active Engineering Branches</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {metadata.branches.map((branch) => {
                const totalSections = (branch.years || []).reduce(
                  (acc: number, yr: any) => acc + (yr.sections?.length || 0),
                  0
                );
                return (
                  <div key={branch.id} className="rounded-xl bg-slate-950/40 p-4 border border-white/5 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="inline-flex items-center rounded-lg bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
                        {branch.code}
                      </span>
                      <span className="text-xs text-slate-500">
                        {totalSections} Sections
                      </span>
                    </div>
                    <h5 className="text-sm font-medium text-white">{branch.name}</h5>
                    
                    <div className="mt-2 space-y-3 pt-2 border-t border-white/5">
                      {(branch.years || []).map((yr: any) => (
                        <div key={yr.id} className="space-y-1">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Year {yr.yearNumber}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {yr.sections?.length === 0 ? (
                              <span className="text-[9px] text-slate-600 italic">No sections added</span>
                            ) : (
                              yr.sections?.map((sec: any) => (
                                <span key={sec.id} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
                                  Sec {sec.sectionName} ({sec.strength} stds)
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Teachers Tab */}
        {activeTab === "teachers" && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white">Faculty Directory</h4>
            <div className="overflow-hidden rounded-xl border border-white/5 bg-slate-950/40">
              <table className="min-w-full divide-y divide-white/5">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Department</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400">Source</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400">Weekly Cap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {metadata.teachers.map((teacher: any) => (
                    <tr key={teacher.id} className="hover:bg-slate-900/20">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-white">{teacher.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">{teacher.department}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                          teacher.source === "TRAINING_DEPT" 
                            ? "bg-purple-500/10 text-purple-400" 
                            : "bg-blue-500/10 text-blue-400"
                        }`}>
                          {teacher.source}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm font-mono text-slate-300">{teacher.maxHoursPerWeek} hrs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Rooms Tab */}
        {activeTab === "rooms" && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white">Infrastructure Resources</h4>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {metadata.rooms.map((room: any) => (
                <div key={room.id} className="rounded-xl bg-slate-950/40 p-4 border border-white/5 text-center">
                  <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold border ${
                    room.type === "LAB" 
                      ? "bg-teal-500/10 text-teal-400 border-teal-500/20" 
                      : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  }`}>
                    {room.type}
                  </span>
                  <h5 className="mt-2 text-base font-bold text-white">{room.name}</h5>
                  <p className="mt-1 text-xs text-slate-500">Cap: {room.capacity} students</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subjects Tab */}
        {activeTab === "subjects" && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white">Course Syllabus Catalog</h4>
            <div className="overflow-hidden rounded-xl border border-white/5 bg-slate-950/40">
              <table className="min-w-full divide-y divide-white/5">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Branch & Yr</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400">Type</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {allSubjects.map((subject: any) => (
                    <tr key={subject.id} className="hover:bg-slate-900/20">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-indigo-400 font-mono">{subject.code}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-white font-medium">{subject.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">
                        {subject.branchCode} ({subject.yearNumber} Yr)
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          subject.weeklyLabHours > 0 
                            ? "bg-teal-500/10 text-teal-400" 
                            : "bg-slate-800 text-slate-300"
                        }`}>
                          {subject.weeklyLabHours > 0 ? "Lab" : "Lecture"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm font-mono text-slate-400">{subject.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
