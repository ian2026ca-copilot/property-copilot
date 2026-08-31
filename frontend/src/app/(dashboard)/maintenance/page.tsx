"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  maintenanceApi, vendorsApi, unitsApi,
  type MaintenanceOut, type MaintenanceStatus, type MaintenancePriority, type PaymentStatus,
  type VendorOut, type VendorAvailabilityOut, type UnitDetailOut,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/roles";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES: MaintenanceStatus[] = ["SUBMITTED","UNDER_REVIEW","SCHEDULED","IN_PROGRESS","COMPLETED","CLOSED","CANCELLED"];

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  SUBMITTED:"Submitted", UNDER_REVIEW:"Under Review", SCHEDULED:"Scheduled",
  IN_PROGRESS:"In Progress", COMPLETED:"Completed", CLOSED:"Closed", CANCELLED:"Cancelled",
};

const STATUS_STYLE: Record<MaintenanceStatus, string> = {
  SUBMITTED:"bg-indigo-100 text-indigo-700", UNDER_REVIEW:"bg-yellow-100 text-yellow-700",
  SCHEDULED:"bg-blue-100 text-blue-700", IN_PROGRESS:"bg-orange-100 text-orange-700",
  COMPLETED:"bg-emerald-100 text-emerald-700", CLOSED:"bg-slate-100 text-slate-500", CANCELLED:"bg-red-100 text-red-600",
};

const PRIORITY_STYLE: Record<string, string> = {
  LOW:"bg-slate-100 text-slate-500", MEDIUM:"bg-blue-100 text-blue-600",
  HIGH:"bg-orange-100 text-orange-600", EMERGENCY:"bg-red-100 text-red-600",
};

const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  UNPAID:"bg-red-100 text-red-600", PAID:"bg-emerald-100 text-emerald-700",
};

const CATEGORIES = ["Plumbing","Electrical","HVAC","Appliance","Structural","Painting","Pest Control","Cleaning","Landscaping","Other"];

const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-CA",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}
function fmtDate(s: string) {
  return new Date(s+"T00:00:00").toLocaleDateString("en-CA",{month:"short",day:"numeric",weekday:"short"});
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({message,onConfirm,onCancel}:{message:string;onConfirm:()=>void;onCancel:()=>void}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <p className="text-sm text-slate-700 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Remove</button>
        </div>
      </div>
    </div>
  );
}

// ─── Submit Modal ─────────────────────────────────────────────────────────────

function SubmitModal({units,vendors,editing,onClose,onSave}:{units:UnitDetailOut[];vendors:VendorOut[];editing?:MaintenanceOut;onClose:()=>void;onSave:(r:MaintenanceOut)=>void}) {
  const { user } = useAuth();
  const perms = can(user?.role);
  const [form,setForm]=useState(()=>editing?{
    unit_id:editing.unit_id,title:editing.title,description:editing.description,category:editing.category,
    priority:editing.priority,status:editing.status,price:editing.price!=null?String(editing.price):"",tax:editing.tax!=null?String(editing.tax):"",payment_status:editing.payment_status,preferred_time_start:editing.preferred_time_start?.slice(0,16)??"",preferred_time_end:editing.preferred_time_end?.slice(0,16)??"",
  }:{unit_id:"",title:"",description:"",category:"Plumbing",priority:"MEDIUM" as MaintenancePriority,status:"SUBMITTED" as MaintenanceStatus,price:"",tax:"",payment_status:"UNPAID" as PaymentStatus,preferred_time_start:"",preferred_time_end:""});
  const [vendorSearch,setVendorSearch]=useState("");
  const [selectedVendor,setSelectedVendor]=useState<VendorOut|null>(()=>editing?vendors.find(v=>v.user_id===editing.vendor_id)??null:null);
  const [showVendorPicker,setShowVendorPicker]=useState(false);
  const [files,setFiles]=useState<File[]>([]);
  const [existingAttachments,setExistingAttachments]=useState(editing?.attachments??[]);
  const [notes,setNotes]=useState(editing?.notes??[]);
  const [newNote,setNewNote]=useState("");
  const [addingNote,setAddingNote]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const [showAiPanel,setShowAiPanel]=useState(false);
  const [aiInstructions,setAiInstructions]=useState("");
  const [generating,setGenerating]=useState(false);
  const [aiError,setAiError]=useState("");

  async function handleAiGenerate(){
    setGenerating(true);setAiError("");
    try{
      const out=await maintenanceApi.aiGenerate({unit_id:form.unit_id||undefined,category:form.category||undefined,priority:form.priority||undefined,extra_instructions:aiInstructions||undefined});
      setForm(f=>({...f,title:out.title,description:out.description}));
      setShowAiPanel(false);setAiInstructions("");
    }catch(err:any){setAiError(err.message??"Failed to generate");}finally{setGenerating(false);}
  }

  async function removeExistingAttachment(attId:string){
    if(!editing)return;
    await maintenanceApi.deleteAttachment(editing.id,attId);
    setExistingAttachments(prev=>prev.filter(a=>a.id!==attId));
  }

  async function addNote(){
    if(!editing||!newNote.trim())return;
    setAddingNote(true);
    try{const req=await maintenanceApi.addNote(editing.id,newNote.trim());setNotes(req.notes);setNewNote("");}
    finally{setAddingNote(false);}
  }
  async function deleteNote(noteId:string){
    if(!editing)return;
    await maintenanceApi.removeNote(editing.id,noteId);
    setNotes(prev=>prev.filter(n=>n.id!==noteId));
  }

  const filePreviews=useMemo(()=>files.map(f=>f.type.startsWith("image/")?URL.createObjectURL(f):null),[files]);
  useEffect(()=>()=>{filePreviews.forEach(url=>{if(url)URL.revokeObjectURL(url);});},[filePreviews]);

  // Show every vendor by default; narrow down with the search box
  const filteredVendors = vendorSearch.trim()
    ? vendors.filter(v=>{
        const q=vendorSearch.toLowerCase();
        return v.full_name.toLowerCase().includes(q)||v.business_name.toLowerCase().includes(q);
      })
    : vendors;

  // Group units by property for optgroup rendering
  const byProperty = units.reduce<Record<string,{name:string;address:string;units:UnitDetailOut[]}>>((acc,u)=>{
    if(!acc[u.property_id]) acc[u.property_id]={name:u.property_name,address:u.property_address,units:[]};
    acc[u.property_id].units.push(u);
    return acc;
  },{});

  const selectedUnit = units.find(u=>u.id===form.unit_id);

  // Older requests may have an assignee recorded by name only (no linked Vendor record)
  const legacyAssigneeName = editing && !selectedVendor ? (editing.vendor_name || editing.assignee_name) : null;

  const priceNum = form.price?parseFloat(form.price):0;
  const taxNum = form.tax?parseFloat(form.tax):0;
  const totalNum = (form.price||form.tax)?priceNum+taxNum:null;

  function set(k:string,v:string){setForm(f=>({...f,[k]:v}));}

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!form.unit_id||!form.title||!form.description){setError("Unit, title and description required.");return;}
    setSaving(true);
    try{
      if(editing){
        let req=await maintenanceApi.update(editing.id,{unit_id:form.unit_id,title:form.title,description:form.description,category:form.category,priority:form.priority,status:form.status,price:form.price?priceNum:null,tax:form.tax?taxNum:null,total:totalNum,payment_status:form.payment_status,preferred_time_start:form.preferred_time_start||null,preferred_time_end:form.preferred_time_end||null,...(selectedVendor?{vendor_id:selectedVendor.user_id}:{})});
        for(const file of files) req=await maintenanceApi.uploadAttachment(req.id,file);
        onSave(req);
        return;
      }
      let req=await maintenanceApi.create({unit_id:form.unit_id,title:form.title,description:form.description,category:form.category,priority:form.priority,price:form.price?priceNum:null,tax:form.tax?taxNum:null,total:totalNum,payment_status:form.payment_status,preferred_time_start:form.preferred_time_start||null,preferred_time_end:form.preferred_time_end||null});
      if(selectedVendor){
        req=await maintenanceApi.update(req.id,{vendor_id:selectedVendor.user_id,status:"UNDER_REVIEW"});
      }
      for(const file of files) req=await maintenanceApi.uploadAttachment(req.id,file);
      onSave(req);
    }catch(err:any){setError(err.message??"Failed");}finally{setSaving(false);}
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">{editing?"Edit maintenance request":"New maintenance request"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error&&<p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Unit picker — grouped by property */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Unit *</label>
            <select
              value={form.unit_id}
              onChange={e=>set("unit_id",e.target.value)}
              className={inp}
            >
              <option value="">— select unit —</option>
              {Object.values(byProperty).map(prop=>(
                <optgroup key={prop.name} label={`${prop.name} · ${prop.address}`}>
                  {prop.units.map(u=>(
                    <option key={u.id} value={u.id}>
                      Unit {u.unit_number}{u.tenant_name ? ` — ${u.tenant_name}` : " — Vacant"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Auto-fill info card */}
            {selectedUnit && (
              <div className={`mt-2 rounded-lg px-3 py-2.5 flex items-center gap-3 text-xs ${selectedUnit.tenant_name ? "bg-slate-50 border border-slate-200" : "bg-amber-50 border border-amber-200"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold ${selectedUnit.tenant_name ? "bg-slate-200 text-slate-600" : "bg-amber-200 text-amber-700"}`}>
                  {selectedUnit.tenant_name ? selectedUnit.tenant_name.split(" ").map((w:string)=>w[0]).join("").slice(0,2).toUpperCase() : "—"}
                </div>
                <div className="min-w-0">
                  {selectedUnit.tenant_name ? (
                    <>
                      <p className="font-medium text-slate-800">{selectedUnit.tenant_name}</p>
                      <p className="text-slate-500 truncate">{selectedUnit.tenant_email}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-amber-800">Vacant unit</p>
                      <p className="text-amber-600">No current tenant</p>
                    </>
                  )}
                </div>
                <div className="ml-auto text-right shrink-0">
                  <p className="text-slate-500">{selectedUnit.bedrooms}bd</p>
                  <p className="font-medium text-slate-700">${selectedUnit.monthly_rent.toLocaleString()}/mo</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
              <select value={form.category} onChange={e=>set("category",e.target.value)} className={inp}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
              <select value={form.priority} onChange={e=>set("priority",e.target.value)} className={inp}>
                <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option><option value="EMERGENCY">Emergency</option>
              </select>
            </div>
          </div>

          <div>
            {!showAiPanel ? (
              <button type="button" onClick={()=>setShowAiPanel(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 hover:border-violet-400 hover:bg-violet-50 rounded-xl text-sm text-slate-500 hover:text-violet-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                ✨ Generate title &amp; description with AI
              </button>
            ) : (
              <div className="border border-violet-200 bg-violet-50 rounded-xl p-3 space-y-2">
                {aiError&&<p className="text-red-600 text-xs bg-red-50 px-2 py-1.5 rounded-lg">{aiError}</p>}
                <label className="block text-xs font-medium text-violet-700">Extra instructions (optional)</label>
                <textarea value={aiInstructions} onChange={e=>setAiInstructions(e.target.value)} rows={2}
                  placeholder="e.g. tenant said the noise started this morning"
                  className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                <div className="flex gap-2">
                  <button type="button" onClick={()=>setShowAiPanel(false)}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                  <button type="button" onClick={handleAiGenerate} disabled={generating}
                    className="ml-auto px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-50">
                    {generating?"Generating…":"✨ Generate"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div><label className="block text-xs font-medium text-slate-500 mb-1">Title *</label>
            <input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. Leaking faucet in bathroom" className={inp}/>
          </div>
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Description *</label>
            <textarea value={form.description} onChange={e=>set("description",e.target.value)} rows={3} className={`${inp} resize-none`}/>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Price ($) <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e=>set("price",e.target.value)} placeholder="0.00" className={inp}/>
            </div>
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Tax ($) <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="number" min="0" step="0.01" value={form.tax} onChange={e=>set("tax",e.target.value)} placeholder="0.00" className={inp}/>
            </div>
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Total ($)</label>
              <div className={`${inp} bg-slate-50 text-slate-700 flex items-center`}>{totalNum!=null?totalNum.toFixed(2):"—"}</div>
            </div>
          </div>
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Payment status</label>
            <select value={form.payment_status} onChange={e=>set("payment_status",e.target.value)} className={inp}>
              <option value="UNPAID">Unpaid</option>
              <option value="PAID">Paid</option>
            </select>
          </div>
          {editing && (
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select value={form.status} onChange={e=>set("status",e.target.value)} className={inp}>
                {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          )}
          {/* Vendor picker — managers & agents only */}
          {perms.manageMaintenance && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[13px] uppercase tracking-wider font-medium text-slate-400 mb-2">Assign vendor (optional)</p>
              {selectedVendor ? (
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[13px] font-bold shrink-0">
                    {selectedVendor.full_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{selectedVendor.full_name}</p>
                    <p className="text-[13px] text-slate-500">{selectedVendor.business_name} · {selectedVendor.service_categories.join(", ")}</p>
                  </div>
                  <button type="button" onClick={()=>{setSelectedVendor(null);setShowVendorPicker(true);}} className="text-xs text-slate-500 hover:text-black shrink-0">Change</button>
                  <button type="button" onClick={()=>setSelectedVendor(null)} className="text-slate-400 hover:text-slate-600 text-lg shrink-0">×</button>
                </div>
              ) : legacyAssigneeName && !showVendorPicker ? (
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center text-[13px] font-bold shrink-0">
                    {legacyAssigneeName.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{legacyAssigneeName}</p>
                    <p className="text-[13px] text-slate-400">Not linked to a vendor record</p>
                  </div>
                  <button type="button" onClick={()=>setShowVendorPicker(true)} className="text-xs text-slate-500 hover:text-black shrink-0">Change</button>
                </div>
              ) : !showVendorPicker ? (
                <button type="button" onClick={()=>setShowVendorPicker(true)}
                  className="w-full px-3 py-2.5 border border-dashed border-slate-200 rounded-lg text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors">
                  + Select vendor
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={vendorSearch}
                      onChange={e=>{setVendorSearch(e.target.value);setSelectedVendor(null);}}
                      placeholder="Search by name or business (optional)"
                      className={inp}
                      autoFocus
                    />
                    <button type="button" onClick={()=>{setShowVendorPicker(false);setVendorSearch("");}} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">Cancel</button>
                  </div>
                  {filteredVendors.length>0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-44 overflow-y-auto">
                      {filteredVendors.map(v=>(
                        <button key={v.id} type="button"
                          onClick={()=>{setSelectedVendor(v);setVendorSearch("");setShowVendorPicker(false);}}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[12px] font-bold shrink-0">
                            {v.full_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{v.full_name}</p>
                            <p className="text-[13px] text-slate-500 truncate">{v.business_name} · {v.service_categories.join(", ")}</p>
                          </div>
                          {v.service_categories.some(c=>c.toLowerCase()===form.category.toLowerCase()) && (
                            <span className="ml-auto text-[12px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full shrink-0">match</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {vendorSearch.trim()&&filteredVendors.length===0&&(
                    <p className="text-xs text-slate-400 px-1">No vendors found for &quot;{vendorSearch}&quot;</p>
                  )}
                  {!vendorSearch.trim()&&vendors.length===0&&(
                    <p className="text-xs text-slate-400 px-1">No vendors added yet.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[13px] uppercase tracking-wider font-medium text-slate-400 mb-2">Preferred time window (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">From</label>
                <input type="datetime-local" value={form.preferred_time_start} onChange={e=>set("preferred_time_start",e.target.value)} className={inp}/>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">To</label>
                <input type="datetime-local" value={form.preferred_time_end} onChange={e=>set("preferred_time_end",e.target.value)} className={inp}/>
              </div>
            </div>
          </div>
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Photos / attachments</label>
            <div className="border border-dashed border-slate-200 rounded-lg p-3">
              {(existingAttachments.length>0||files.length>0)&&(
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {existingAttachments.map(a=>(
                    <div key={a.id} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-50 flex items-center justify-center">
                      {a.original_name.match(/\.(jpg|jpeg|png|webp)$/i)
                        ?<img src={a.url} alt={a.original_name} className="w-full h-full object-cover"/>
                        :<p className="text-[12px] text-slate-500 truncate p-1.5 text-center">{a.original_name}</p>}
                      <button type="button" onClick={()=>removeExistingAttachment(a.id)}
                        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/60 text-white text-[12px] leading-none flex items-center justify-center hover:bg-red-600">×</button>
                    </div>
                  ))}
                  {files.map((f,i)=>(
                    <div key={i} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-50 flex items-center justify-center">
                      {filePreviews[i]
                        ?<img src={filePreviews[i]!} alt={f.name} className="w-full h-full object-cover"/>
                        :<p className="text-[12px] text-slate-500 truncate p-1.5 text-center">{f.name}</p>}
                      <button type="button" onClick={()=>setFiles(fs=>fs.filter((_,j)=>j!==i))}
                        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/60 text-white text-[12px] leading-none flex items-center justify-center hover:bg-red-600">×</button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={()=>fileRef.current?.click()} className="text-xs text-slate-500 hover:text-black">+ Add files</button>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
                onChange={e=>{if(e.target.files)setFiles(fs=>[...fs,...Array.from(e.target.files!)])}}/>
            </div>
          </div>
          {editing && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[13px] uppercase tracking-wider font-medium text-slate-400 mb-2">Notes ({notes.length})</p>
              {notes.length>0&&(
                <div className="space-y-2 mb-2 max-h-44 overflow-y-auto pr-1">
                  {notes.map(n=>(
                    <div key={n.id} className="bg-slate-50 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-700">{n.author_name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-[13px] text-slate-400">{fmtDt(n.created_at)}</p>
                          {n.author_user_id===user?.id&&(
                            <button type="button" onClick={()=>deleteNote(n.id)} className="text-[13px] text-slate-400 hover:text-red-500">Delete</button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap mt-0.5">{n.note}</p>
                    </div>
                  ))}
                </div>
              )}
              <textarea value={newNote} onChange={e=>setNewNote(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Add a note…"/>
              <button type="button" onClick={addNote} disabled={addingNote||!newNote.trim()}
                className="mt-1.5 w-full px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {addingNote?"Adding…":"Add note"}
              </button>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving?(editing?"Saving…":"Submitting…"):(editing?"Save changes":"Submit request")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Manage Modal (Review + Schedule combined) ────────────────────────────────

function ManageModal({req,vendors,onClose,onSave}:{req:MaintenanceOut;vendors:VendorOut[];onClose:()=>void;onSave:(r:MaintenanceOut)=>void}) {
  const [form,setForm]=useState({
    est_hours_min:req.est_hours_min?.toString()??"",
    est_hours_max:req.est_hours_max?.toString()??"",
    est_cost_min:req.est_cost_min?.toString()??"",
    est_cost_max:req.est_cost_max?.toString()??"",
    assignee_name:req.assignee_name??"",
    status:req.status,
  });
  const [vendorId,setVendorId]=useState(()=>{
    // pre-select vendor if already scheduled
    if(!req.vendor_id) return "";
    const match=vendors.find(v=>v.user_id===req.vendor_id);
    return match?.id??"";
  });
  const [slots,setSlots]=useState<VendorAvailabilityOut[]>([]);
  const [selectedSlot,setSelectedSlot]=useState<VendorAvailabilityOut|null>(null);
  const [scheduledStart,setScheduledStart]=useState(req.scheduled_start?.slice(0,16)??"");
  const [scheduledEnd,setScheduledEnd]=useState(req.scheduled_end?.slice(0,16)??"");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!vendorId){setSlots([]);return;}
    vendorsApi.listAvailability(vendorId).then(setSlots).catch(()=>{});
  },[vendorId]);

  function setF(k:string,v:string){setForm(f=>({...f,[k]:v}));}

  function selectSlot(slot:VendorAvailabilityOut){
    setSelectedSlot(slot);
    setScheduledStart(`${slot.date}T${slot.start_time.slice(0,5)}`);
    setScheduledEnd(`${slot.date}T${slot.end_time.slice(0,5)}`);
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();
    setSaving(true);setError("");
    try{
      // Always save review/estimate
      let updated=await maintenanceApi.review(req.id,{
        est_hours_min:form.est_hours_min?parseFloat(form.est_hours_min):null,
        est_hours_max:form.est_hours_max?parseFloat(form.est_hours_max):null,
        est_cost_min:form.est_cost_min?parseFloat(form.est_cost_min):null,
        est_cost_max:form.est_cost_max?parseFloat(form.est_cost_max):null,
        assignee_name:form.assignee_name||null,
        status:form.status,
      });
      // Schedule only if vendor+time provided AND something changed from existing values
      const origVendorId=vendors.find(v=>v.user_id===req.vendor_id)?.id??"";
      const scheduleChanged=vendorId!==(origVendorId)||scheduledStart!==(req.scheduled_start?.slice(0,16)??"")
        ||scheduledEnd!==(req.scheduled_end?.slice(0,16)??"");
      if(vendorId&&scheduledStart&&scheduledEnd&&scheduleChanged){
        const vendor=vendors.find(v=>v.id===vendorId);
        if(!vendor) throw new Error("Vendor not found");
        updated=await maintenanceApi.schedule(updated.id,{
          vendor_id:vendor.user_id,
          scheduled_start:scheduledStart,
          scheduled_end:scheduledEnd,
          availability_id:selectedSlot?.id??null,
        });
      }
      onSave(updated);
    }catch(err:any){setError(err.message??"Failed");}finally{setSaving(false);}
  }

  const slotsByDate:Record<string,VendorAvailabilityOut[]>={};
  slots.forEach(s=>{(slotsByDate[s.date]=slotsByDate[s.date]??[]).push(s);});

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold">Manage request</h2>
            <p className="text-[13px] text-slate-400 mt-0.5">{req.property_name} · Unit {req.unit_number}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl shrink-0">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-5">
          {error&&<p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Request summary */}
          <div className="bg-slate-50 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-slate-900">{req.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[12px] font-medium ${PRIORITY_STYLE[req.priority]}`}>{req.priority}</span>
              <span className="text-[13px] text-slate-400">{req.category}</span>
              {req.preferred_time_start&&<span className="text-[13px] text-blue-600">Preferred: {fmtDt(req.preferred_time_start)}</span>}
            </div>
          </div>

          {/* ── Section 1: Status & Estimate ── */}
          <div className="space-y-3">
            <p className="text-[13px] uppercase tracking-wider font-semibold text-slate-400">Status &amp; Estimate</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                <select value={form.status} onChange={e=>setF("status",e.target.value)} className={inp}>
                  {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Assignee</label>
                <input value={form.assignee_name} onChange={e=>setF("assignee_name",e.target.value)} placeholder="Name or team" className={inp}/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Hours min</label>
                <input type="number" min="0" step="0.5" value={form.est_hours_min} onChange={e=>setF("est_hours_min",e.target.value)} placeholder="1" className={inp}/>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Hours max</label>
                <input type="number" min="0" step="0.5" value={form.est_hours_max} onChange={e=>setF("est_hours_max",e.target.value)} placeholder="3" className={inp}/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Cost min ($)</label>
                <input type="number" min="0" step="10" value={form.est_cost_min} onChange={e=>setF("est_cost_min",e.target.value)} placeholder="100" className={inp}/>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Cost max ($)</label>
                <input type="number" min="0" step="10" value={form.est_cost_max} onChange={e=>setF("est_cost_max",e.target.value)} placeholder="300" className={inp}/>
              </div>
            </div>
          </div>

          {/* ── Section 2: Vendor & Schedule ── */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-[13px] uppercase tracking-wider font-semibold text-slate-400">Vendor &amp; Schedule <span className="normal-case font-normal text-slate-300">(optional)</span></p>
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Vendor</label>
              <select value={vendorId} onChange={e=>{setVendorId(e.target.value);setSelectedSlot(null);setScheduledStart("");setScheduledEnd("");}} className={inp}>
                <option value="">— no vendor assigned —</option>
                {vendors.map(v=><option key={v.id} value={v.id}>{v.business_name||v.full_name} — {v.full_name} {v.service_categories.length?"("+v.service_categories.join(", ")+")" :""}</option>)}
              </select>
            </div>
            {vendorId&&(
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Pick an available slot</p>
                {Object.keys(slotsByDate).length===0
                  ?<p className="text-xs text-slate-400 italic px-1">No availability added by this vendor yet — enter time manually below.</p>
                  :<div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {Object.entries(slotsByDate).map(([date,daySlots])=>(
                      <div key={date}>
                        <p className="text-[13px] font-medium text-slate-500 mb-1">{fmtDate(date)}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {daySlots.map(slot=>(
                            <button key={slot.id} type="button" onClick={()=>selectSlot(slot)}
                              className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${selectedSlot?.id===slot.id?"bg-black text-white border-black":"border-slate-200 hover:border-slate-400 text-slate-700"}`}>
                              {slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                }
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Scheduled start</label>
                <input type="datetime-local" value={scheduledStart} onChange={e=>setScheduledStart(e.target.value)} className={inp}/>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Scheduled end</label>
                <input type="datetime-local" value={scheduledEnd} onChange={e=>setScheduledEnd(e.target.value)} className={inp}/>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving?"Saving…":"Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

const WEEKDAY_LABELS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function dateKey(d:Date){return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;}

function CalendarView({requests,onSelect}:{requests:MaintenanceOut[];onSelect:(r:MaintenanceOut)=>void}) {
  const [cursor,setCursor]=useState(()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d;});

  const year=cursor.getFullYear();
  const month=cursor.getMonth();
  const startWeekday=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const daysInPrevMonth=new Date(year,month,0).getDate();

  const cells:{date:Date;inMonth:boolean}[]=[];
  for(let i=0;i<startWeekday;i++) cells.push({date:new Date(year,month-1,daysInPrevMonth-startWeekday+1+i),inMonth:false});
  for(let d=1;d<=daysInMonth;d++) cells.push({date:new Date(year,month,d),inMonth:true});
  while(cells.length<42) cells.push({date:new Date(year,month+1,cells.length-startWeekday-daysInMonth+1),inMonth:false});

  const byDate=useMemo(()=>{
    const map=new Map<string,MaintenanceOut[]>();
    requests.forEach(r=>{
      const raw=r.scheduled_start||r.preferred_time_start||r.created_at;
      if(!raw)return;
      const key=dateKey(new Date(raw));
      if(!map.has(key)) map.set(key,[]);
      map.get(key)!.push(r);
    });
    return map;
  },[requests]);

  const todayKey=dateKey(new Date());

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <button type="button" onClick={()=>setCursor(c=>new Date(c.getFullYear(),c.getMonth()-1,1))}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">‹</button>
        <p className="text-sm font-semibold text-slate-900">{cursor.toLocaleDateString("en-CA",{month:"long",year:"numeric"})}</p>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={()=>setCursor(()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d;})}
            className="text-xs text-slate-500 hover:text-black px-2 py-1 rounded-lg hover:bg-slate-100">Today</button>
          <button type="button" onClick={()=>setCursor(c=>new Date(c.getFullYear(),c.getMonth()+1,1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100">
        {WEEKDAY_LABELS.map(d=>(
          <div key={d} className="px-2 py-2 text-center text-[13px] font-medium text-slate-400 uppercase tracking-wide">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell,i)=>{
          const key=dateKey(cell.date);
          const dayReqs=byDate.get(key)??[];
          const isToday=key===todayKey;
          return (
            <div key={i} className={`min-h-[100px] border-b border-r border-slate-100 p-1.5 ${!cell.inMonth?"bg-slate-50/60":""}`}>
              <p className={`text-[13px] mb-1 ${isToday?"inline-flex items-center justify-center w-5 h-5 rounded-full bg-black text-white font-semibold":cell.inMonth?"text-slate-600 font-medium":"text-slate-300"}`}>
                {cell.date.getDate()}
              </p>
              <div className="space-y-1">
                {dayReqs.slice(0,3).map(r=>(
                  <button key={r.id} type="button" onClick={()=>onSelect(r)}
                    className={`w-full text-left px-1.5 py-0.5 rounded text-[12px] font-medium truncate ${STATUS_STYLE[r.status]}`}>
                    {r.title}
                  </button>
                ))}
                {dayReqs.length>3&&<p className="text-[12px] text-slate-400 px-1.5">+{dayReqs.length-3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const [requests,setRequests]=useState<MaintenanceOut[]>([]);
  const [vendors,setVendors]=useState<VendorOut[]>([]);
  const [units,setUnits]=useState<UnitDetailOut[]>([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState<MaintenanceStatus|"ALL">("ALL");
  const [search,setSearch]=useState("");
  const [view,setView]=useState<"list"|"calendar">("list");

  type Modal={type:"submit"}|{type:"edit";req:MaintenanceOut}|{type:"manage";req:MaintenanceOut}|{type:"remove";req:MaintenanceOut};
  const [modal,setModal]=useState<Modal|null>(null);

  const load=useCallback(async()=>{
    try{
      const [reqs,vs,us]=await Promise.all([maintenanceApi.list(),vendorsApi.list().catch(()=>[]),unitsApi.listAll()]);
      setRequests(reqs);setVendors(vs);setUnits(us);
    }finally{setLoading(false);}
  },[]);

  useEffect(()=>{load();},[load]);

  async function handleRemove(req:MaintenanceOut){
    try{await maintenanceApi.remove(req.id);}catch{return;}
    setRequests(prev=>prev.filter(r=>r.id!==req.id));
    setModal(null);
  }

  const handleSave=useCallback((req:MaintenanceOut)=>{
    const id=String(req.id);
    setRequests(prev=>{
      const idx=prev.findIndex(r=>String(r.id)===id);
      return idx>=0?prev.map((r,i)=>i===idx?req:r):[req,...prev];
    });
    setModal(null);
    // Refresh from server to ensure UI is in sync
    maintenanceApi.list().then(reqs=>setRequests(reqs)).catch(()=>{});
  },[]);

  const filtered=requests.filter(r=>{
    if(filter!=="ALL"&&r.status!==filter)return false;
    if(search){const q=search.toLowerCase();return r.title.toLowerCase().includes(q)||r.unit_number?.toLowerCase().includes(q)||r.property_name?.toLowerCase().includes(q)||r.submitted_by_name?.toLowerCase().includes(q)||false;}
    return true;
  });

  const counts:Record<string,number>={ALL:requests.length};
  STATUSES.forEach(s=>{counts[s]=requests.filter(r=>r.status===s).length;});

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] uppercase tracking-widest text-slate-400 font-medium">Operations</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Maintenance</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-xl p-0.5">
            <button onClick={()=>setView("list")}
              className={`px-3 py-1.5 rounded-[10px] text-xs font-medium transition-colors ${view==="list"?"bg-white text-slate-900 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
              List
            </button>
            <button onClick={()=>setView("calendar")}
              className={`px-3 py-1.5 rounded-[10px] text-xs font-medium transition-colors ${view==="calendar"?"bg-white text-slate-900 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
              Calendar
            </button>
          </div>
          <button onClick={()=>setModal({type:"submit"})} className="px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-slate-800">+ New request</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL",...STATUSES] as const).map(s=>(
          <button key={s} onClick={()=>setFilter(s as any)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter===s?"bg-black text-white":"bg-white border border-slate-200 text-slate-600 hover:border-slate-300"}`}>
            {s==="ALL"?"All":STATUS_LABEL[s as MaintenanceStatus]}{counts[s]>0&&<span className="ml-1 opacity-60">({counts[s]})</span>}
          </button>
        ))}
        <div className="ml-auto">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, unit, property…"
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black w-64"/>
        </div>
      </div>

      {view==="calendar"?(
        <CalendarView requests={filtered} onSelect={r=>setModal({type:"edit",req:r})}/>
      ):(
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {["Title","Unit","Category","Priority","Status","Total price","Estimate","Scheduled","Files",""].map(h=>(
                <th key={h} className="text-left text-[13px] font-medium text-slate-400 uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading&&<tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">Loading…</td></tr>}
            {!loading&&filtered.length===0&&(
              <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400 text-sm">
                {search||filter!=="ALL"?"No requests match your filter.":"No maintenance requests yet."}
              </td></tr>
            )}
            {filtered.map(r=>(
              <tr key={r.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={()=>setModal({type:"edit",req:r})}>
                <td className="px-4 py-3 max-w-[200px]">
                  <p className="text-xs font-medium text-slate-900 truncate">{r.title}</p>
                  <p className="text-[13px] text-slate-400">{r.submitted_by_name}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-slate-700">Unit {r.unit_number}</p>
                  <p className="text-[13px] text-slate-400 truncate max-w-[120px]">{r.property_name}</p>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.category}</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[12px] font-medium ${PRIORITY_STYLE[r.priority]}`}>{r.priority}</span></td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[13px] font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                <td className="px-4 py-3 text-xs font-medium text-slate-700">
                  {r.total!=null?`$${r.total.toFixed(2)}`:"—"}
                  {r.total!=null&&(
                    <span className={`ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[13px] font-medium align-middle ${PAYMENT_STATUS_STYLE[r.payment_status]}`}>
                      {r.payment_status==="PAID"?"Paid":"Unpaid"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.est_cost_min?`$${r.est_cost_min}–$${r.est_cost_max}`:"—"}
                  {r.est_hours_min&&<><br/>{r.est_hours_min}–{r.est_hours_max} hrs</>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.scheduled_start?<div><p className="font-medium text-slate-700">{r.vendor_name}</p><p>{fmtDt(r.scheduled_start)}</p></div>:"—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{r.attachments.length>0?`${r.attachments.length} file${r.attachments.length>1?"s":""}`:"—"}</td>
                <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={()=>setModal({type:"edit",req:r})}
                      className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={()=>setModal({type:"remove",req:r})}
                      className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg hover:bg-red-50 hover:border-red-200 text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {modal?.type==="submit"&&<SubmitModal units={units} vendors={vendors} onClose={()=>setModal(null)} onSave={r=>{handleSave(r);}}/>}
      {modal?.type==="edit"&&<SubmitModal units={units} vendors={vendors} editing={modal.req} onClose={()=>setModal(null)} onSave={r=>{handleSave(r);}}/>}
      {modal?.type==="manage"&&<ManageModal req={modal.req} vendors={vendors} onClose={()=>setModal(null)} onSave={handleSave}/>}
      {modal?.type==="remove"&&(
        <ConfirmDialog
          message={`Remove "${modal.req.title}"? This will permanently delete the request and its attachments.`}
          onConfirm={()=>handleRemove(modal.req)}
          onCancel={()=>setModal(null)}
        />
      )}
    </div>
  );
}
