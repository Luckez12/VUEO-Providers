#!/usr/bin/env python3
import argparse, hashlib, json, re, shutil
from pathlib import Path

PROVIDERS = [
    ("4KHDHub", "4khdhub"),
    ("KissKH", "kisskh"),
    ("MSM21", "msm21"),
    ("MovieBox", "moviebox"),
    ("OneTouchTV", "onetouchtv"),
    ("OppaDrama", "oppadrama"),
    ("PencuriMovie", "pencurimovie"),
]
PATTERNS = {
    "http_get": r"\bapp\.get\s*\(",
    "http_post": r"\bapp\.post\s*\(",
    "load_extractor": r"\bloadExtractor\s*\(",
    "webview": r"\bWebView\b|android\.webkit|shouldInterceptRequest",
    "aes_crypto": r"\bAES\b|Cipher\.getInstance|SecretKeySpec|IvParameterSpec",
    "base64": r"\bBase64\b|base64",
    "html_dom": r"\.select\s*\(|Jsoup|org\.jsoup|Document\b|Element\b",
    "json": r"parseJson|toJson|fromJson|jackson|Gson|JsonProperty",
    "m3u8": r"m3u8|M3u8",
    "extractor_api": r"ExtractorApi",
    "load_links": r"override\s+suspend\s+fun\s+loadLinks|\bloadLinks\s*\(",
    "search": r"override\s+suspend\s+fun\s+search|\bsearch\s*\(",
    "coroutines": r"coroutineScope|async\s*\{|awaitAll|withContext|Dispatchers",
}
URL_RE = re.compile(r"https?://[^\"'\s)<>]+")
MAIN_URL_RE = re.compile(r"(?:mainUrl|mainURL|baseUrl|baseURL)\s*=\s*[\"']([^\"']+)")

def count(pattern, text):
    return len(re.findall(pattern, text, re.I | re.M))

def source_hash(files):
    h = hashlib.sha256()
    for path in sorted(files):
        h.update(str(path).encode())
        h.update(path.read_bytes())
    return h.hexdigest()

def extract_main_urls(text):
    urls=[]
    for m in MAIN_URL_RE.finditer(text):
        value=m.group(1)
        if value.startswith('http') and value not in urls:
            urls.append(value)
    return urls

def analyse(source_dir, source_name, provider_id):
    kt_files=sorted(source_dir.rglob('*.kt'))
    text='\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in kt_files)
    counts={name: count(pattern,text) for name,pattern in PATTERNS.items()}
    urls=sorted(set(URL_RE.findall(text)))
    main_urls=extract_main_urls(text)
    auto=[]; manual=[]; blockers=[]; score=100
    if counts['http_get'] or counts['http_post']: auto.append('HTTP GET/POST -> fetch compatibility helper')
    if counts['json']: auto.append('JSON parsing/models -> JavaScript objects/JSON')
    if counts['base64']: auto.append('Base64 -> compatibility helper')
    if counts['m3u8']: auto.append('HLS URL detection -> VUEO stream output')
    if counts['html_dom']:
        manual.append('HTML/Jsoup selectors need DOM translation'); score-=18
    if counts['load_extractor'] or counts['extractor_api']:
        manual.append('CloudStream extractor calls need JS extractor adapters'); score-=20
    if counts['aes_crypto']:
        manual.append('AES/crypto logic needs bundled JS crypto adapter'); score-=18
    if counts['coroutines']:
        manual.append('Coroutine concurrency needs Promise translation'); score-=7
    if counts['webview']:
        blockers.append('Android WebView/network interception cannot be auto-converted to plain VUEO JS'); score-=45
    score=max(0,score)
    if blockers: status='MANUAL_RUNTIME_REQUIRED'
    elif score>=82: status='AUTO_PORT_CANDIDATE'
    elif score>=55: status='ADAPTERS_REQUIRED'
    else: status='MANUAL_PORT_REQUIRED'
    return {
        'sourceName':source_name,'id':provider_id,'status':status,'score':score,
        'kotlinFiles':[str(p.relative_to(source_dir)).replace('\\','/') for p in kt_files],
        'kotlinFileCount':len(kt_files),'sourceSha256':source_hash(kt_files) if kt_files else None,
        'counts':counts,'mainUrls':main_urls,'discoveredUrls':urls[:80],
        'autoMappings':auto,'manualAdapters':manual,'blockers':blockers,
    }

def write_scaffold(out_dir,result):
    pdir=out_dir/result['id']; pdir.mkdir(parents=True,exist_ok=True)
    (pdir/'analysis.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    urls=result['mainUrls'] or result['discoveredUrls'][:8]
    todo=result['manualAdapters']+result['blockers']
    todo_comments='\n'.join('// TODO: '+x for x in todo) or '// No hard manual adapter detected by scanner.'
    source_files=', '.join(result['kotlinFiles'])
    js=f'''// AUTO-GENERATED VUEO conversion scaffold.\n// Source: CloudStream/{result['sourceName']}\n// Status: {result['status']} | score={result['score']}\n// Kotlin files: {source_files}\n// Do not promote this file to providers/ until runtime tests pass.\n\nvar CS_PROVIDER_ID = {json.dumps(result['id'])};\nvar CS_BASE_URLS = {json.dumps(urls,ensure_ascii=False,indent=2)};\n\n{todo_comments}\n\nfunction getStreams(tmdbId, mediaType, season, episode) {{\n  console.log("[VUEO converter] provider=" + CS_PROVIDER_ID + " status={result['status']} tmdbId=" + tmdbId);\n  return Promise.resolve([]);\n}}\n\nif (typeof module !== "undefined" && module.exports) {{\n  module.exports = {{ getStreams: getStreams }};\n}} else {{\n  global.getStreams = getStreams;\n}}\n'''
    (pdir/'provider.generated.js').write_text(js,encoding='utf-8')

def write_runtime(path):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text('''// Shared compatibility helpers for generated VUEO providers.\nfunction csHeaders(base, extra) {\n  var out = {};\n  Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });\n  Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });\n  return out;\n}\nfunction csGet(url, headers) {\n  return fetch(url, { method: "GET", headers: headers || {} });\n}\nfunction csPost(url, body, headers) {\n  return fetch(url, { method: "POST", headers: headers || {}, body: body });\n}\nfunction csJson(response) {\n  if (!response || !response.ok) throw new Error("HTTP " + (response ? response.status : "unknown"));\n  return response.json();\n}\nfunction csText(response) {\n  if (!response || !response.ok) throw new Error("HTTP " + (response ? response.status : "unknown"));\n  return response.text();\n}\nfunction csStream(name, url, quality, headers, subtitles) {\n  return { name: name, title: name + (quality ? " " + quality : ""), url: url, quality: quality || "Auto", headers: headers || {}, subtitles: subtitles || [] };\n}\nif (typeof module !== "undefined" && module.exports) {\n  module.exports = { csHeaders: csHeaders, csGet: csGet, csPost: csPost, csJson: csJson, csText: csText, csStream: csStream };\n}\n''',encoding='utf-8')

def write_report(path,results):
    lines=['# CloudStream to VUEO Conversion Report','','Generated automatically from the current CloudStream source.','',
           '| Provider | Score | Classification | HTTP | HTML | Crypto | Extractors | WebView |',
           '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |']
    for r in results:
        c=r['counts']
        lines.append(f"| {r['sourceName']} | {r['score']} | `{r['status']}` | {c['http_get']+c['http_post']} | {c['html_dom']} | {c['aes_crypto']} | {c['load_extractor']+c['extractor_api']} | {c['webview']} |")
    lines += ['', '## Recommended order', '']
    for i,r in enumerate(sorted(results,key=lambda x:(-x['score'],x['sourceName'].lower())),1):
        lines.append(f"{i}. **{r['sourceName']}**: `{r['status']}` ({r['score']}/100)")
        for x in r['manualAdapters']: lines.append(f"   * Adapter: {x}")
        for x in r['blockers']: lines.append(f"   * Blocker: {x}")
    lines += ['', '## Meaning', '',
              '* `AUTO_PORT_CANDIDATE`: mostly HTTP/JSON logic. This is the best automatic translation target.',
              '* `ADAPTERS_REQUIRED`: common conversion is possible, but HTML, extractor or crypto adapters are needed.',
              '* `MANUAL_RUNTIME_REQUIRED`: Android runtime behaviour such as WebView interception was detected.', '',
              'Converter v1 writes only to `generated/`. Existing runtime files under `providers/` are never overwritten.', '']
    path.write_text('\n'.join(lines),encoding='utf-8')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source',required=True); ap.add_argument('--output',default='generated'); ap.add_argument('--report',default='CONVERSION_REPORT.md'); args=ap.parse_args()
    source=Path(args.source); out=Path(args.output)
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)
    results=[]
    for source_name,provider_id in PROVIDERS:
        p=source/source_name
        if not p.exists(): raise SystemExit(f'Missing CloudStream provider: {source_name}')
        r=analyse(p,source_name,provider_id); results.append(r); write_scaffold(out,r)
    write_runtime(Path('runtime/cloudstream.js'))
    write_report(Path(args.report),results)
    Path('conversion-report.json').write_text(json.dumps({'providers':results},indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print('Converted scan targets:')
    for r in results: print(f" - {r['sourceName']}: {r['status']} ({r['score']}/100)")

if __name__=='__main__': main()
