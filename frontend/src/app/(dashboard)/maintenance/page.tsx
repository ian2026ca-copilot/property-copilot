"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  maintenanceApi, vendorsApi, unitsApi,
  type MaintenanceOut, type MaintenanceStatus, type MaintenancePriority,
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

// ─── Submit Modal ─────────────────────────────────────────────────────────────

function SubmitModal({units,vendors,onClose,onSave}:{units:UnitDetailOut[];vendors:VendorOut[];onClose:()=>void;onSave:(r:MaintenanceOut)=>void}) {
  const { user } = useAuth();
  const perms = can(user?.role);
  const [form,setForm]=useState({unit_id:"",title:"",description:"",category:"Plumbing",priority:"MEDIUM" as MaintenancePriority,preferred_time_start:"",preferred_time_end:""});
  const [vendorSearch,setVendorSearch]=useState("");
  const [selectedVendor,setSelectedVendor]=useState<VendorOut|null>(null);
  const [files,setFiles]=useState<File[]>([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  // Filter vendors: match category then apply search query
  const categoryVendors = vendors.filter(v=>
    v.service_categories.some(c=>c.toLowerCase()===form.category.toLowerCase())
  );
  const filteredVendors = vendorSearch.trim()
    ? vendors.filter(v=>{
        const q=vendorSearch.toLowerCase();
        return v.full_name.toLowerCase().includes(q)||v.business_name.toLowerCase().includes(q);
      })
    : categoryVendors;

  // Group units by property for optgroup rendering
  const byProperty = units.reduce<Record<string,{name:string;address:string;units:UnitDetailOut[]}>>((acc,u)=>{
    if(!acc[u.property_id]) acc[u.property_id]={name:u.property_name,address:u.property_address,units:[]};
    acc[u.property_id].units.push(u);
    return acc;
  },{});

  const selectedUnit = units.find(u=>u.id===form.unit_id);

  function set(k:string,v:string){setForm(f=>({...f,[k]:v}));}

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!form.unit_id||!form.title||!form.description){setError("Unit, title and description required.");return;}
    setSaving(true);
    try{
      let req=await maintenanceApi.create({unit_id:form.unit_id,title:form.title,description:form.description,category:form.category,priority:form.priority,preferred_time_start:form.preferred_time_start||null,preferred_time_end:form.preferred_time_end||null});
      if(selectedVendor){
        req=await maintenanceApi.review(req.id,{assignee_name:selectedVendor.full_name,status:"UNDER_REVIEW"});
      }
      for(const file of files) req=await maintenanceApi.uploadAttachment(req.id,file);
      onSave(req);
    }catch(err:any){setError(err.message??"Failed");}finally{setSaving(false);}
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">New maintenance request</h2>
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
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${selectedUnit.tenant_name ? "bg-slate-200 text-slate-600" : "bg-amber-200 text-amber-700"}`}>
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

          <div><label className="block text-xs font-medium text-slate-500 mb-1">Title *</label>
            <input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. Leaking faucet in bathroom" className={inp}/>
          </div>
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Description *</label>
            <textarea value={form.description} onChange={e=>set("description",e.target.value)} rows={3} className={`${inp} resize-none`}/>
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
          {/* Vendor picker — managers & agents only */}
          {perms.manageMaintenance && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-2">Assign vendor (optional)</p>
              {selectedVendor ? (
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                    {selectedVendor.full_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{selectedVendor.full_name}</p>
                    <p className="text-[11px] text-slate-500">{selectedVendor.business_name} · {selectedVendor.service_categories.join(", ")}</p>
                  </div>
                  <button type="button" onClick={()=>setSelectedVendor(null)} className="text-slate-400 hover:text-slate-600 text-lg shrink-0">×</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    value={vendorSearch}
                    onChange={e=>{setVendorSearch(e.target.value);setSelectedVendor(null);}}
                    placeholder={`Search by name or business${categoryVendors.length>0?` (${categoryVendors.length} match${categoryVendors.length>1?"es":""} for ${form.category})`:""}`}
                    className={inp}
                  />
                  {filteredVendors.length>0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-44 overflow-y-auto">
                      {filteredVendors.map(v=>(
                        <button key={v.id} type="button"
                          onClick={()=>{setSelectedVendor(v);setVendorSearch("");}}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {v.full_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{v.full_name}</p>
                            <p className="text-[11px] text-slate-500 truncate">{v.business_name} · {v.service_categories.join(", ")}</p>
                          </div>
                          {v.service_categories.some(c=>c.toLowerCase()===form.category.toLowerCase()) && (
                            <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full shrink-0">match</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {vendorSearch.trim()&&filteredVendors.length===0&&(
                    <p className="text-xs text-slate-400 px-1">No vendors found for &quot;{vendorSearch}&quot;</p>
                  )}
                  {!vendorSearch.trim()&&categoryVendors.length===0&&vendors.length>0&&(
                    <p className="text-xs text-slate-400 px-1">No vendors registered for {form.category}. Start typing to search all vendors.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-2">Preferred time window (optional)</p>
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
              {files.length>0&&<div className="flex flex-wrap gap-2 mb-2">{files.map((f,i)=>(
                <div key={i} className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-600">
                  {f.name}<button type="button" onClick={()=>setFiles(fs=>fs.filter((_,j)=>j!==i))} className="text-slate-400 hover:text-red-500 ml-1">×</button>
                </div>
              ))}</div>}
              <button type="button" onClick={()=>fileRef.current?.click()} className="text-xs text-slate-500 hover:text-black">+ Add files</button>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
                onChange={e=>{if(e.target.files)setFiles(fs=>[...fs,...Array.from(e.target.files!)])}}/>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving?"Submitting…":"Submit request"}
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
            <p className="text-[11px] text-slate-400 mt-0.5">{req.property_name} · Unit {req.unit_number}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl shrink-0">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-5">
          {error&&<p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Request summary */}
          <div className="bg-slate-50 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-slate-900">{req.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_STYLE[req.priority]}`}>{req.priority}</span>
              <span className="text-[11px] text-slate-400">{req.category}</span>
              {req.preferred_time_start&&<span className="text-[11px] text-blue-600">Preferred: {fmtDt(req.preferred_time_start)}</span>}
            </div>
          </div>

          {/* ── Section 1: Status & Estimate ── */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Status &amp; Estimate</p>
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
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Vendor &amp; Schedule <span className="normal-case font-normal text-slate-300">(optional)</span></p>
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
                        <p className="text-[11px] font-medium text-slate-500 mb-1">{fmtDate(date)}</p>
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

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({req,onClose,onUpdate}:{req:MaintenanceOut;onClose:()=>void;onUpdate:(r:MaintenanceOut)=>void}) {
  const [notes,setNotes]=useState(req.resolution_notes??"");
  const [status,setStatus]=useState(req.status);
  const [saving,setSaving]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const [uploading,setUploading]=useState(false);

  async function saveUpdate(){
    setSaving(true);
    try{const u=await maintenanceApi.update(req.id,{status,resolution_notes:notes||null});onUpdate(u);}
    finally{setSaving(false);}
  }
  async function handleFile(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return;
    setUploading(true);
    try{onUpdate(await maintenanceApi.uploadAttachment(req.id,file));}finally{setUploading(false);}
  }
  async function deleteAtt(attId:string){
    await maintenanceApi.deleteAttachment(req.id,attId);
    onUpdate({...req,attachments:req.attachments.filter(a=>a.id!==attId)});
  }

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold truncate pr-4">{req.title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl shrink-0">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[req.status]}`}>{STATUS_LABEL[req.status]}</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${PRIORITY_STYLE[req.priority]}`}>{req.priority}</span>
            <span className="text-[11px] text-slate-400">{req.category}</span>
          </div>
          <div className="text-sm bg-slate-50 rounded-lg px-4 py-3">
            <p className="font-medium">{req.property_name} — Unit {req.unit_number}</p>
            <p className="text-xs text-slate-500 mt-0.5">By {req.submitted_by_name} · {req.created_at?new Date(req.created_at).toLocaleDateString():"—"}</p>
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{req.description}</p>
          {req.preferred_time_start&&(
            <div className="bg-blue-50 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-blue-700 mb-0.5">Tenant preferred time</p>
              <p className="text-sm text-blue-900">{fmtDt(req.preferred_time_start)} – {fmtDt(req.preferred_time_end)}</p>
            </div>
          )}
          {(req.est_cost_min||req.est_hours_min)&&(
            <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-2 gap-3">
              {req.est_hours_min&&<div><p className="text-[11px] text-slate-400">Est. hours</p><p className="text-sm font-medium">{req.est_hours_min}–{req.est_hours_max} hrs</p></div>}
              {req.est_cost_min&&<div><p className="text-[11px] text-slate-400">Est. cost</p><p className="text-sm font-medium">${req.est_cost_min}–${req.est_cost_max}</p></div>}
            </div>
          )}
          {req.scheduled_start&&(
            <div className="bg-emerald-50 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-emerald-700 mb-0.5">Scheduled with {req.vendor_name}</p>
              <p className="text-sm text-emerald-900">{fmtDt(req.scheduled_start)} – {fmtDt(req.scheduled_end)}</p>
            </div>
          )}
          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500">Attachments ({req.attachments.length})</p>
              <button onClick={()=>fileRef.current?.click()} disabled={uploading} className="text-xs text-black hover:underline">{uploading?"Uploading…":"+ Add"}</button>
              <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFile}/>
            </div>
            {req.attachments.length>0?(
              <div className="grid grid-cols-3 gap-2">
                {req.attachments.map(a=>(
                  <div key={a.id} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-50 flex items-center justify-center">
                    {a.original_name.match(/\.(jpg|jpeg|png|webp)$/i)
                      ?<img src={a.url} alt={a.original_name} className="w-full h-full object-cover"/>
                      :<p className="text-[10px] text-slate-500 truncate p-2">{a.original_name}</p>}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button onClick={()=>deleteAtt(a.id)} className="text-white text-xs bg-red-600 px-2 py-1 rounded">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ):<p className="text-xs text-slate-400 italic">No attachments</p>}
          </div>
          {/* Update */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Update status</label>
              <select value={status} onChange={e=>setStatus(e.target.value as MaintenanceStatus)} className={inp}>
                {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Resolution notes</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className={`${inp} resize-none`} placeholder="Add notes…"/>
            </div>
            <button onClick={saveUpdate} disabled={saving}
              className="w-full px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving?"Saving…":"Save update"}
            </button>
          </div>
        </div>
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

  type Modal={type:"submit"}|{type:"manage";req:MaintenanceOut};
  const [modal,setModal]=useState<Modal|null>(null);
  const [detail,setDetail]=useState<MaintenanceOut|null>(null);

  const load=useCallback(async()=>{
    try{
      const [reqs,vs,us]=await Promise.all([maintenanceApi.list(),vendorsApi.list().catch(()=>[]),unitsApi.listAll()]);
      setRequests(reqs);setVendors(vs);setUnits(us);
    }finally{setLoading(false);}
  },[]);

  useEffect(()=>{load();},[load]);

  const handleSave=useCallback((req:MaintenanceOut)=>{
    const id=String(req.id);
    setRequests(prev=>{
      const idx=prev.findIndex(r=>String(r.id)===id);
      return idx>=0?prev.map((r,i)=>i===idx?req:r):[req,...prev];
    });
    if(detail&&String(detail.id)===id) setDetail(req);
    setModal(null);
    // Refresh from server to ensure UI is in sync
    maintenanceApi.list().then(reqs=>setRequests(reqs)).catch(()=>{});
  },[detail]);

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
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Operations</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Maintenance</h1>
        </div>
        <button onClick={()=>setModal({type:"submit"})} className="px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-slate-800">+ New request</button>
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

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {["Title","Unit","Category","Priority","Status","Estimate","Scheduled","Files",""].map(h=>(
                <th key={h} className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading&&<tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">Loading…</td></tr>}
            {!loading&&filtered.length===0&&(
              <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">
                {search||filter!=="ALL"?"No requests match your filter.":"No maintenance requests yet."}
              </td></tr>
            )}
            {filtered.map(r=>(
              <tr key={r.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={()=>setDetail(r)}>
                <td className="px-4 py-3 max-w-[200px]">
                  <p className="text-xs font-medium text-slate-900 truncate">{r.title}</p>
                  <p className="text-[11px] text-slate-400">{r.submitted_by_name}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-slate-700">Unit {r.unit_number}</p>
                  <p className="text-[11px] text-slate-400 truncate max-w-[120px]">{r.property_name}</p>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.category}</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_STYLE[r.priority]}`}>{r.priority}</span></td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.est_cost_min?`$${r.est_cost_min}–$${r.est_cost_max}`:"—"}
                  {r.est_hours_min&&<><br/>{r.est_hours_min}–{r.est_hours_max} hrs</>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.scheduled_start?<div><p className="font-medium text-slate-700">{r.vendor_name}</p><p>{fmtDt(r.scheduled_start)}</p></div>:"—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{r.attachments.length>0?`${r.attachments.length} file${r.attachments.length>1?"s":""}`:"—"}</td>
                <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                  <button
                    onClick={()=>setModal({type:"manage",req:r})}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600"
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.type==="submit"&&<SubmitModal units={units} vendors={vendors} onClose={()=>setModal(null)} onSave={r=>{handleSave(r);}}/>}
      {modal?.type==="manage"&&<ManageModal req={modal.req} vendors={vendors} onClose={()=>setModal(null)} onSave={handleSave}/>}
      {detail&&<DetailDrawer req={detail} onClose={()=>setDetail(null)} onUpdate={r=>{handleSave(r);setDetail(r);}}/>}
    </div>
  );
}
