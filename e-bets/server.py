from flask import Flask, send_from_directory, make_response
import os

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

NO_CACHE_EXTS = {'.html', '.css', '.js'}

def no_cache(filename, resp):
    if os.path.splitext(filename)[1].lower() in NO_CACHE_EXTS:
        resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        resp.headers['Pragma'] = 'no-cache'
        resp.headers['Expires'] = '0'
    return resp

@app.route('/')
def index():
    resp = make_response(send_from_directory(BASE_DIR, 'index.html'))
    return no_cache('index.html', resp)

@app.route('/<path:filename>')
def static_files(filename):
    resp = make_response(send_from_directory(BASE_DIR, filename))
    return no_cache(filename, resp)

if __name__ == '__main__':
    print('Servidor rodando em http://localhost:8000')
    app.run(port=8000, debug=False)
