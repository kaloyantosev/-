import zipfile
import xml.etree.ElementTree as ET

docx_path = r'C:\Users\Terve\.gemini\antigravity\brain\ec472d32-9e33-4a2d-9829-7b2aa61d38ca\.user_uploaded\media_1791885624797_319f4a5f.docx'

with zipfile.ZipFile(docx_path) as z:
    xml_data = z.read('word/document.xml')

root = ET.fromstring(xml_data)
namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

pages = [[]]
current_page_idx = 1

for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
    p_text = ''
    # iterate over children of p
    for elem in p:
        tag = elem.tag.split('}')[-1]
        if tag == 'r':
            for r_child in elem:
                r_tag = r_child.tag.split('}')[-1]
                if r_tag == 'lastRenderedPageBreak':
                    pages.append([])
                    current_page_idx += 1
                elif r_tag == 't':
                    p_text += (r_child.text or '')
                elif r_tag == 'tab':
                    p_text += '\t'
        elif tag == 'lastRenderedPageBreak':
            pages.append([])
            current_page_idx += 1
    
    pages[-1].append(p_text)

with open(r'C:\Users\Terve\.gemini\antigravity\scratch\IRIS подпис на документи\docx_exact_pages.txt', 'w', encoding='utf-8') as f:
    f.write(f'TOTAL PAGES: {len(pages)}\n\n')
    for i, p_list in enumerate(pages):
        f.write(f'==================================================\n')
        f.write(f'                     PAGE {i+1}                   \n')
        f.write(f'==================================================\n')
        for line in p_list:
            if line.strip():
                f.write(line + '\n\n')
        f.write('\n')

print(f'Wrote {len(pages)} pages to docx_exact_pages.txt')
