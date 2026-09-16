/* Research metadata only. No microphone request, fingerprinting, storage or network IO.
 * Browser: window.OzniMetadata. Node: require("./metadata.js").
 * Device/OS values are user- or browser-reported, never hardware attestation.
 */
(function(root){
  "use strict";
  const SCHEMA_VERSION = 1;
  const UA_HINT_TIMEOUT_MS = 750;
  const AUDIO_FIELDS = ["sampleRate", "sampleSize", "channelCount", "echoCancellation",
    "noiseSuppression", "autoGainControl", "latency", "volume"];

  function read(object, key){
    try{ return object == null ? undefined : object[key]; }catch(_){ return undefined; }
  }
  function text(value){ return typeof value === "string" && value.trim() ? value.trim() : null; }
  function finite(value){ return typeof value === "number" && Number.isFinite(value) ? value : null; }
  function nonnegative(value){ const n=finite(value); return n !== null && n >= 0 ? n : null; }
  function positive(value){ const n=finite(value); return n !== null && n > 0 ? n : null; }
  function timestamp(value){
    if(typeof value !== "string" && typeof value !== "number") return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  function freeze(value){
    if(value && typeof value === "object"){
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  // Only whitelisted scalar audio settings, or standard constraint dictionaries.
  // Never copy deviceId, groupId, labels, arbitrary vendor fields, or prototypes.
  function constraint(value){
    if(typeof value === "boolean" || typeof value === "string") return value;
    if(typeof value === "number") return finite(value);
    if(value && typeof value === "object" && !Array.isArray(value)){
      const result={};
      for(const key of ["exact", "ideal", "min", "max"]){
        const v=read(value,key);
        if(typeof v === "boolean" || typeof v === "string") result[key]=v;
        else if(finite(v)!==null) result[key]=v;
      }
      return Object.keys(result).length ? result : null;
    }
    return null;
  }
  function audioFields(object){
    const result={};
    for(const key of AUDIO_FIELDS){
      const value=constraint(read(object,key));
      if(value!==null) result[key]=value;
    }
    return result;
  }
  function invoke(object, name){
    try{
      const fn=read(object,name);
      return typeof fn === "function" ? fn.call(object) : null;
    }catch(_){ return null; }
  }
  function brands(value){
    if(!Array.isArray(value)) return [];
    return value.slice(0,20).map(b=>({brand:text(read(b,"brand")), version:text(read(b,"version"))}))
      .filter(b=>b.brand!==null);
  }
  function lowEntropy(ua){
    return {platform:text(read(ua,"platform")), mobile:typeof read(ua,"mobile")==="boolean" ? read(ua,"mobile") : null,
      brands:brands(read(ua,"brands"))};
  }
  async function hints(navigator){
    const ua=read(navigator,"userAgentData");
    const base={source:"navigator.userAgentData", status:"unsupported", ...lowEntropy(ua),
      model:null, platformVersion:null, fullVersionList:[]};
    if(!ua) return base;
    const getter=read(ua,"getHighEntropyValues");
    if(typeof getter!=="function") return {...base,status:"low-entropy-only"};
    let timer;
    // The API has no cancellation method. A late result must not mutate the snapshot.
    const request=Promise.resolve().then(()=>getter.call(ua,["model","platformVersion","fullVersionList"]))
      .then(value=>({status:"available",value}),()=>({status:"unavailable",value:null}));
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve({status:"timeout",value:null}),UA_HINT_TIMEOUT_MS);});
    const result=await Promise.race([request,timeout]);
    clearTimeout(timer);
    if(result.status!=="available" || !result.value) return {...base,status:result.status};
    return {...base,status:"available",model:text(read(result.value,"model")),
      platformVersion:text(read(result.value,"platformVersion")),
      fullVersionList:brands(read(result.value,"fullVersionList"))};
  }

  /** Snapshot before recording. Optional hints never prevent recording indefinitely.
   * requestedConstraints may be supplied to preserve the exact app request; otherwise
   * getConstraints() is captured separately as browser-reported track constraints.
   * Unknown/missing values stay null. No OS version is inferred from the UA string:
   * Safari 26+ and Chromium Android intentionally freeze OS/model UA tokens.
   */
  async function collect(options={}){
    const navigator=read(options,"navigator");
    const track=read(options,"track");
    // Snapshot synchronous state BEFORE waiting for optional asynchronous hints.
    const manual={source:"user",model:text(read(options,"model")),osVersion:text(read(options,"osVersion")),
      deviceName:text(read(options,"deviceName"))};
    const snapshot={
      schemaVersion:SCHEMA_VERSION,
      recorderVersion:text(read(options,"version")),
      session:{id:text(read(options,"sessionId")),startedAt:timestamp(read(options,"startedAt")),
        mode:text(read(options,"mode")),label:text(read(options,"label"))},
      manual,
      browserReported:{source:"browser-reported",rawUserAgent:text(read(navigator,"userAgent")),
        uaClientHints:null},
      device:null,
      capture:{
        audioContextSampleRate:positive(read(options,"audioContextRate")),
        requestedConstraints:audioFields(read(options,"requestedConstraints")),
        trackConstraints:audioFields(invoke(track,"getConstraints")),
        trackSettings:audioFields(invoke(track,"getSettings")),
        supportedConstraints:audioFields(invoke(read(navigator,"mediaDevices"),"getSupportedConstraints")),
        trackState:{kind:text(read(track,"kind")),readyState:text(read(track,"readyState")),
          muted:typeof read(track,"muted")==="boolean" ? read(track,"muted") : null},
        settingsSource:"MediaStreamTrack browser-reported; not microphone calibration",
        pcmEncoding:"signed 16-bit little-endian mono WAV"
      }
    };
    const reported=await hints(navigator);
    snapshot.browserReported.uaClientHints=reported;
    snapshot.device={
      model:{value:manual.model || reported.model,source:manual.model ? "user" : reported.model ? "ua-client-hints" : "unknown"},
      osVersion:{value:manual.osVersion || reported.platformVersion,source:manual.osVersion ? "user" : reported.platformVersion ? "ua-client-hints" : "unknown"},
      inferenceNote:"Raw user-agent OS/model tokens are not treated as exact device facts. User/client-hint values are reported, not verified."
    };
    return freeze(snapshot);
  }

  // Deep JSON-safe copy for our own persisted metadata, without invoking toJSON.
  // Guard corrupted/legacy records and remove unique media IDs even from old records.
  function jsonCopy(value, depth=0, seen=new Set()){
    if(value===null || typeof value==="string" || typeof value==="boolean") return value;
    if(typeof value==="number") return finite(value);
    if(!value || typeof value!=="object" || depth>12 || seen.has(value)) return null;
    seen.add(value);
    let result;
    if(Array.isArray(value)) result=value.map(v=>jsonCopy(v,depth+1,seen));
    else{
      result={};
      for(const key of Object.keys(value)){
        if(["__proto__","constructor","prototype","deviceId","groupId"].includes(key)) continue;
        const v=read(value,key);
        if(typeof v!=="function" && typeof v!=="undefined") result[key]=jsonCopy(v,depth+1,seen);
      }
    }
    seen.delete(value);
    return result;
  }
  /** A sidecar object (serialize with JSON.stringify). Never collect current device
   * metadata here: an old/recovered recording must retain its original provenance.
   */
  function exportForRecording(rec={}){
    const metadata=jsonCopy(read(rec,"metadata"));
    const fallbackRate=metadata && metadata.capture ? metadata.capture.audioContextSampleRate : null;
    const captureEnd=metadata && metadata.captureEnd ? metadata.captureEnd : null;
    const integrity=jsonCopy(read(rec,"integrity"));
    const recovered=[read(rec,"recovered"),read(captureEnd,"recovered"),read(integrity,"recovered")]
      .find(value=>typeof value==="boolean");
    const quality=jsonCopy(read(rec,"quality"));
    return freeze({
      schemaVersion:SCHEMA_VERSION,
      kind:"ozni-research-recording",
      metadataStatus:metadata ? "captured" : "unavailable-legacy-or-unsaved",
      metadata,
      recording:{
        id:text(read(rec,"id")) || (metadata && metadata.session ? text(metadata.session.id) : null),
        filename:text(read(rec,"name")),
        sampleRate:positive(read(rec,"rate")) || positive(fallbackRate),
        durationSeconds:nonnegative(read(rec,"dur")),
        capturedSamples:nonnegative(read(rec,"capturedSamples")) ?? nonnegative(read(captureEnd,"capturedSamples")),
        savedSamples:nonnegative(read(rec,"savedSamples")),
        finalizedAt:timestamp(read(rec,"finalizedAt")) || timestamp(read(captureEnd,"endedAt")),
        stopReason:text(read(captureEnd,"reason")),
        recovered:typeof recovered==="boolean" ? recovered : null,
        recovery:jsonCopy(read(rec,"recovery")),
        integrity,
        quality
      }
    });
  }

  const api=Object.freeze({SCHEMA_VERSION,UA_HINT_TIMEOUT_MS,collect,exportForRecording});
  if(typeof module==="object" && module.exports) module.exports=api;
  if(root) root.OzniMetadata=api;
})(typeof globalThis!=="undefined" ? globalThis : this);
