import os
src = r'C:\Users\kzelaya2\.gemini\antigravity-ide\scratch\fleet-management'
replacements = {
    'Ã³': 'ó', 'Ã©': 'é', 'Ã¡': 'á', 'Ã­': 'í', 'Ãº': 'ú', 'Ã±': 'ñ',
    'Ã"': 'Ó', 'Ã‰': 'É', 'Ã': 'Á', 'Ã': 'Í', 'Ãš': 'Ú', 'Ã\x91': 'Ñ',
    'Ã¼': 'ü', 'Ãœ': 'Ü', 'Â¿': '¿', 'Â¡': '¡',
    '\xe2\x80\x9c': '"', '\xe2\x80\x9d': '"', '\xe2\x80\x98': "'", '\xe2\x80\x99': "'",
    '\xe2\x80\x94': '—', '\xe2\x80\x9c': '€', '\xe2\x80\x98': "'", '\xe2\x80\x99': "'",
}
for root, dirs, files in os.walk(src):
    for fname in files:
        if fname.endswith(('.js', '.css', '.html', '.md', '.sql')):
            path = os.path.join(root, fname)
            try:
                with open(path, 'r', encoding='utf-8') as fh:
                    content = fh.read()
                original = content
                for k, v in replacements.items():
                    content = content.replace(k, v)
                if content != original:
                    with open(path, 'w', encoding='utf-8') as fh:
                        fh.write(content)
                    print("CORREGIDO:", os.path.relpath(path, src))
                else:
                    print("OK:", os.path.relpath(path, src))
            except Exception as e:
                print("ERROR", os.path.relpath(path, src), e)