import glob
import os
import re

files = glob.glob('*.html')
if 'index.html' in files:
    files.remove('index.html')
    
for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    title_match = re.search(r'<title>(.*?)</title>', content)
    if title_match and '<meta name="description"' not in content:
        title = title_match.group(1).replace(' | Corporate Majdoor', '')
        meta_tag = f'<meta name="description" content="Corporate Majdoor legal and policy document regarding {title}.">'
        content = content.replace('</title>', f'</title>\n  {meta_tag}')
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
