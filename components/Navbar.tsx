"use client";

import React from "react";
import { Calendar, RefreshCw, BookOpen, Layers } from "lucide-react";

interface NavbarProps {
  onGenerate: () => void;
  isGenerating: boolean;
}

export default function Navbar({ onGenerate, isGenerating }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo and title */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-indigo-500/20">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              AutoSchedule AI
            </h1>
            <p className="text-xs text-slate-400">Engineering College Timetable Generator</p>
          </div>
        </div>

        {/* Action button */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="relative inline-flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:from-indigo-500 hover:to-purple-500 hover:shadow-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:pointer-events-none disabled:opacity-50 active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
            <span>{isGenerating ? "Generating..." : "Generate Timetable"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
