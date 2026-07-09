import os
import psycopg2
import pandas as pd
from flask import Flask, Blueprint, jsonify, render_template, request

# ── 1. 앱 생성 및 경로 설정 ──
SERVICE_NAME = os.environ.get('SERVICE_NAME', '')
BASE_PATH = (os.environ.get('BASE_PATH') or (f'/{SERVICE_NAME}' if SERVICE_NAME else '')).rstrip('/')

app = Flask(__name__, static_url_path=f'{BASE_PATH}/static', static_folder='static')
bp = Blueprint('main', __name__)

# ── 2. DB 연결 함수 ──
def get_db_connection():
    return psycopg2.connect(
        host=os.environ.get('LDAS_POSTGRES_HOST'),
        port=os.environ.get('LDAS_POSTGRES_PORT', '5432'),
        database=os.environ.get('LDAS_POSTGRES_DATABASE'),
        user=os.environ.get('LDAS_POSTGRES_USER'),
        password=os.environ.get('LDAS_POSTGRES_PASSWORD')
    )

# ── 3. 모든 라우트 정의 (Blueprint 하단에 정의) ──
@bp.route('/')
def index():
    return render_template('index.html', service_name=SERVICE_NAME or 'support-wg', base_path=BASE_PATH, environment=os.environ.get('ENVIRONMENT', 'dev'), hostname=os.uname().nodename)

@bp.route('/api/count-uman-dong')
def count_uman_dong():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM swing.bld_integ_info WHERE up_myun_dong_nm = '우만동';")
        count = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        return jsonify({"status": "success", "building_count": count})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@bp.route('/api/chart-data-1')
def get_chart_data_1():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = """SELECT rcv_dt_month, COUNT(c_hash), COUNT(c_hash) FILTER (WHERE rcv_oper_st_cd_nm = '접수취소') 
                   FROM swing.f_oschgaddr_ldas_cg_dd 
                   WHERE rcv_dt_year = 2026 AND achg_ct_pvc_cd_nm IN ('서울', '경기', '인천') 
                   GROUP BY rcv_dt_month ORDER BY rcv_dt_month;"""
        cursor.execute(query)
        data = [{"month": row[0], "total": row[1], "cancel": row[2]} for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── 4. 라우트 및 앱 등록 ──
app.register_blueprint(bp, url_prefix=BASE_PATH)

@app.route('/healthz')
def healthz(): return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
