#!/usr/bin/env python3
import argparse, json, re
from pathlib import Path


def grab(pattern, text, label):
    m = re.search(pattern, text)
    if not m:
        raise SystemExit(f'Could not extract {label}')
    return m.group(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--template', required=True)
    ap.add_argument('--output', required=True)
    args = ap.parse_args()

    root = Path(args.source)
    kotlin = root / 'KissKH/src/main/kotlin/com/kisskh/KissKH.kt'
    if not kotlin.exists():
        raise SystemExit(f'Missing {kotlin}')
    text = kotlin.read_text(encoding='utf-8')

    values = {
        '__MAIN_URL__': grab(r'override\s+var\s+mainUrl\s*=\s*"([^"]+)"', text, 'mainUrl'),
        '__VERSION__': grab(r'KISSKH_VERSION\s*=\s*"([^"]+)"', text, 'KISSKH_VERSION'),
        '__VIDEO_KEY_API__': grab(r'VIDEO_KEY_API\s*=\s*"([^"]+)"', text, 'VIDEO_KEY_API'),
        '__SUBTITLE_KEY_API__': grab(r'SUBTITLE_KEY_API\s*=\s*"([^"]+)"', text, 'SUBTITLE_KEY_API'),
        '__USER_AGENT__': grab(r'USER_AGENT\s*=\s*"([^"]+)"', text, 'USER_AGENT'),
    }

    required = [
        '/api/DramaList/Search',
        '/api/DramaList/Drama/',
        '/api/DramaList/Episode/',
        '/api/Sub/',
        'JsonProperty("Video")',
        'JsonProperty("ThirdParty")',
    ]
    missing = [x for x in required if x not in text]
    if missing:
        raise SystemExit('KissKH source changed, missing: ' + ', '.join(missing))

    generated = Path(args.template).read_text(encoding='utf-8')
    for token, value in values.items():
        generated = generated.replace(token, json.dumps(value, ensure_ascii=False))

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'provider.generated.js').write_text(generated, encoding='utf-8')
    analysis = {
        'id': 'kisskh',
        'status': 'GENERATED_WITH_ADAPTER',
        'adapterVersion': 2,
        'source': str(kotlin.relative_to(root)),
        'sourceConstants': {
            'mainUrl': values['__MAIN_URL__'],
            'kisskhVersion': values['__VERSION__'],
            'videoKeyApi': values['__VIDEO_KEY_API__'],
            'subtitleKeyApi': values['__SUBTITLE_KEY_API__'],
        },
        'automaticMappings': [
            'TMDB id to title',
            'DramaList search',
            'Drama detail and year check',
            'episode selection',
            'video key endpoint',
            'episode video endpoint',
            'direct HLS MP4 DASH',
            'English Malay Indonesian subtitle URLs',
        ],
        'manualLimitations': [
            'CloudStream loadExtractor third party hosts are not converted in v2',
            'encrypted .txt subtitle interception is not converted in v2',
            'KissKH source does not expose explicit season mapping',
        ],
    }
    (out / 'analysis.json').write_text(json.dumps(analysis, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('Generated KissKH from current Kotlin source')


if __name__ == '__main__':
    main()
