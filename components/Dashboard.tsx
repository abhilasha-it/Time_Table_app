"use client";

import React from "react";
import { Layers, GraduationCap, Users, Home, Activity } from "lucide-react";

interface DashboardProps {
  stats: {
    branchesCount: number;
    sectionsCount: number;
    teachersCount: number;
    roomsCount: number;
    slotsScheduledCount: number;
  };
}

export default function Dashboard({ stats }: DashboardProps) {
  const cards = [
    {
      title: "Branches Offered",
      value: stats.branchesCount,
      description: "CS, CSE, ECE, IT, ME...",
      icon: Layers,
      color: "from-blue-500 to-indigo-500",
      shadow: "shadow-blue-500/10",
    },
    {
      title: "Year & Sections",
      value: stats.sectionsCount,
      description: "1st - 4th Yr (A & B)",
      icon: GraduationCap,
      color: "from-purple-500 to-pink-500",
      shadow: "shadow-purple-500/10",
    },
    {
      title: "Faculty Members",
      value: stats.teachersCount,
      description: "Across departments",
      icon: Users,
      color: "from-amber-500 to-orange-500",
      shadow: "shadow-amber-500/10",
    },
    {
      title: "Classrooms & Labs",
      value: stats.roomsCount,
      description: "Lecture Halls & Labs",
      icon: Home,
      color: "from-emerald-500 to-teal-500",
      shadow: "shadow-emerald-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40 p-6 shadow-xl ${card.shadow} backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-white/10`}
            >
              {/* Gradient border bottom */}
              <div className={`absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r ${card.color}`} />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">{card.title}</p>
                  <h3 className="mt-2 text-3xl font-bold tracking-tight text-white">
                    {card.value}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">{card.description}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${card.color} text-white shadow-lg`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scheduler Status Alert */}
      <div className="flex items-center space-x-4 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-5 backdrop-blur-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
          <Activity className="h-5 w-5 animate-pulse" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-white">Engine Status: Ready</h4>
          <p className="text-xs text-indigo-200/60 mt-0.5">
            {stats.slotsScheduledCount > 0
              ? `Currently displaying active timetable with ${stats.slotsScheduledCount} scheduled periods. Click "Generate Timetable" to regenerate.`
              : "No timetable has been generated yet. Please populate inputs and click the Generate button to run the scheduling engine."}
          </p>
        </div>
      </div>
    </div>
  );
}
