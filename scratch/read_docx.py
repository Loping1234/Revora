import zipfile
import xml.etree.ElementTree as ET

def get_docx_text(path):
    """
    Extracts text from a .docx file without using external libraries.
    """
    WORD_NAMESPACE = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    PARA = WORD_NAMESPACE + 'p'
    TEXT = WORD_NAMESPACE + 't'
    
    with zipfile.ZipFile(path) as docx:
        xml_content = docx.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        paragraphs = []
        for p in tree.iter(PARA):
            texts = [t.text for t in p.iter(TEXT) if t.text]
            if texts:
                paragraphs.append(''.join(texts))
        return '\n'.join(paragraphs)

if __name__ == "__main__":
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    try:
        text = get_docx_text('pricing_assistant_plan.docx')
        print(text)
    except Exception as e:
        print(f"Error: {e}")
