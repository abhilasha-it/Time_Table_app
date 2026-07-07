"use client";

import React, { useState } from "react";
import { Upload, AlertCircle, CheckCircle, HelpCircle, Save, RefreshCw, FileSpreadsheet } from "lucide-react";

interface BulkImporterProps {
  onSuccess: () => void;
}

type ImportEntity = "unified-excel" | "faculty" | "subjects" | "fixed-allocations";

export default function BulkImporter({ onSuccess }: BulkImporterProps) {
  const [entity, setEntity] = useState<ImportEntity>("unified-excel");
  const [csvText, setCsvText] = useState("");
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backendErrors, setBackendErrors] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const templates = {
    "unified-excel": "Course,Branch,Semester,Section,Subject Name,Subject Code,Subject Type,Faculty Name\nB.Tech,CSE,5,A,Database Management Systems,CS302,ACADEMIC,Dr. Alok\nB.Tech,CSE,5,A,Compiler Design Lab,CS304,LAB,Dr. Alok\nB.Tech,ECE,3,B,Analog Electronics,EC201,ACADEMIC,Prof. Neha Gupta",
    faculty: "name,department,maxHoursPerWeek,source\nDr. Alok Sharma,CSE,16,COLLEGE\nProf. Neha Gupta,ECE,12,COLLEGE",
    subjects: "code,name,type,credits,weeklyLectureHours,weeklyLabHours,branchCode,yearNumber\nCS-301,Database Systems,ACADEMIC,4,3,3,CSE,3\nTRN-101,Soft Skills,TRAINING,2,0,2,CSE,3",
    "fixed-allocations": "subjectCode,facultyName,sectionName,branchCode,yearNumber,day,slotIndex,roomName\nTRN-101,Dr. Alok Sharma,A,CSE,3,0,0,LH-101"
  };

  const handleLoadTemplate = () => {
    setUploadedFile(null);
    setCsvText(templates[entity]);
    handleParse(templates[entity]);
  };

  // Simple CSV parser
  const handleParse = (textToParse: string) => {
    setErrorMsg(null);
    setBackendErrors([]);
    setSuccessMsg(null);

    const lines = textToParse.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setParsedData([]);
      setHeaders([]);
      return;
    }

    const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
    setHeaders(rawHeaders);

    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
      const record: any = {};
      
      rawHeaders.forEach((header, idx) => {
        record[header] = values[idx] || "";
      });
      data.push(record);
    }

    setParsedData(data);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUploadedFile(null);
    setCsvText(e.target.value);
    handleParse(e.target.value);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setBackendErrors([]);
    setSuccessMsg(null);

    // If it's a binary Excel sheet, handle via multipart form upload directly
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      setUploadedFile(file);
      setCsvText(`File loaded: ${file.name}\n(Size: ${(file.size / 1024).toFixed(1)} KB)`);
      setHeaders(["File Name", "Type", "Status"]);
      setParsedData([{
        "File Name": file.name,
        "Type": "Excel Spreadsheet",
        "Status": "Ready to Import"
      }]);
      return;
    }

    // Otherwise parse CSV/TXT locally
    setUploadedFile(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      handleParse(text);
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    if (parsedData.length === 0) return;
    setIsLoading(true);
    setErrorMsg(null);
    setBackendErrors([]);
    setSuccessMsg(null);

    try {
      let res;
      // Handle spreadsheet file upload
      if (uploadedFile) {
        const formData = new FormData();
        formData.append("file", uploadedFile);
        formData.append("entity", entity);
        res = await fetch("/api/admin/bulk", {
          method: "POST",
          body: formData // Content-Type boundary is set automatically by the browser
        });
      } else {
        // Fallback to JSON payload
        res = await fetch("/api/admin/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity, records: parsedData })
        });
      }

      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.error || "Bulk import failed.");
        if (result.errors) {
          setBackendErrors(result.errors);
        }
      } else {
        setSuccessMsg(uploadedFile 
          ? `Successfully imported Excel template file data into the database!` 
          : `Successfully imported ${result.createdCount} records into the database!`
        );
        setCsvText("");
        setParsedData([]);
        setHeaders([]);
        setUploadedFile(null);
        onSuccess();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unknown network error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Target Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
        <div>
          <h4 className="text-sm font-semibold text-white">Select Entity to Import</h4>
          <p className="text-xs text-slate-400 mt-0.5">Upload records in transactional batches</p>
        </div>
        <div className="flex rounded-xl bg-slate-950 p-1 border border-white/5 overflow-x-auto scrollbar-none max-w-full">
          {([
            { id: "unified-excel", label: "Unified Excel Template" },
            { id: "faculty", label: "Faculty" },
            { id: "subjects", label: "Subjects" },
            { id: "fixed-allocations", label: "Fixed Allocations" }
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setEntity(tab.id as ImportEntity);
                setCsvText("");
                setParsedData([]);
                setHeaders([]);
                setErrorMsg(null);
                setBackendErrors([]);
                setSuccessMsg(null);
                setUploadedFile(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                entity === tab.id 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Upload and Paste */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Spreadsheet / CSV Source</span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={handleLoadTemplate}
                className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
              >
                Load CSV Template
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-5 text-center relative group hover:border-indigo-500/50 transition-colors">
            {uploadedFile ? (
              <FileSpreadsheet className="h-6 w-6 text-emerald-400 mx-auto animate-bounce" />
            ) : (
              <Upload className="h-6 w-6 text-slate-500 group-hover:text-indigo-400 mx-auto transition-colors" />
            )}
            <p className="text-xs text-slate-400 mt-2 font-medium">
              {uploadedFile ? `Loaded: ${uploadedFile.name}` : "Drag & Drop file or "}
              {!uploadedFile && <span className="text-indigo-400 hover:underline cursor-pointer">browse</span>}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Supports Excel (.xlsx) and CSV files</p>
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-400">Or Paste Raw CSV Lines</label>
            <textarea
              rows={8}
              value={csvText}
              onChange={handleTextChange}
              placeholder="Course,Branch,Semester,Section,Subject Name,Subject Code,Subject Type,Faculty Name..."
              className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Preview Panel */}
        <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5 space-y-4 flex flex-col max-h-[420px] overflow-hidden">
          <div className="flex justify-between items-center border-b border-white/5 pb-2 shrink-0">
            <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Parsed Preview</h5>
            <span className="text-xs font-mono text-slate-500">{parsedData.length} records</span>
          </div>

          <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-800">
            {parsedData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2 py-10">
                <HelpCircle className="h-8 w-8 text-slate-600" />
                <p className="text-xs">No records parsed yet. Upload an Excel file or paste CSV rows to preview.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-white/5 text-left">
                <thead className="bg-slate-950/40 sticky top-0 z-10">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {parsedData.slice(0, 50).map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-slate-900/20">
                      {headers.map((h, colIdx) => (
                        <td key={colIdx} className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-300">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {parsedData.length > 50 && (
            <div className="text-[10px] text-slate-500 text-center border-t border-white/5 pt-2 shrink-0">
              Showing first 50 rows of {parsedData.length} total parsed records.
            </div>
          )}
        </div>
      </div>

      {/* Message and Warnings Alerts */}
      {successMsg && (
        <div className="flex items-start space-x-2 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-xs text-emerald-400 animate-pulse">
          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 space-y-2 text-xs">
          <div className="flex items-start space-x-2 text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="font-bold">{errorMsg}</span>
          </div>
          {backendErrors.length > 0 && (
            <div className="pl-6 space-y-1 text-slate-400 max-h-[150px] overflow-y-auto font-mono text-[10px]">
              {backendErrors.map((err, idx) => (
                <div key={idx}>• {err}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trigger Button */}
      {parsedData.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-white/5">
          <button
            type="button"
            disabled={isLoading}
            onClick={handleImportSubmit}
            className="flex items-center space-x-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none cursor-pointer active:scale-95 transition-transform"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Commit {uploadedFile ? "Excel File Data" : `${parsedData.length} Records`} to DB</span>
          </button>
        </div>
      )}

    </div>
  );
}
