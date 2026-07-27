import json
import re
from pathlib import Path
from decimal import Decimal

from db import get_conn, get_schema, load_config


def safe_filename(name: str) -> str:
    name = str(name).strip()
    name = re.sub(r"[\\/:*?\"<>|]", "_", name)
    return f"{name}.json"


def to_int(v):
    if v is None:
        return 0
    return int(v)


def to_float(v):
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def write_json_if_changed(path: Path, data) -> bool:
    new_text = json.dumps(data, ensure_ascii=False, indent=2)

    if path.exists():
        old_text = path.read_text(encoding="utf-8")
        if old_text == new_text:
            return False

    path.write_text(new_text, encoding="utf-8")
    return True


def export_json(year: int, log=print):
    cfg = load_config()
    schema = get_schema()
    repo_path = Path(cfg["github"]["repo_path"])

    data_dir = repo_path / "data"
    area_dir = data_dir / "areas"

    data_dir.mkdir(parents=True, exist_ok=True)
    area_dir.mkdir(parents=True, exist_ok=True)

    area_sql = f"""
    SELECT
        a.area_id,
        a.area_name,
        a.sido,
        a.sigungu,
        ST_AsGeoJSON(a.geom)::json AS geojson,
        ST_Y(ST_Centroid(a.geom)) AS center_lat,
        ST_X(ST_Centroid(a.geom)) AS center_lng,
        COUNT(m.pnu) AS building_count,
        SUM(CASE WHEN m.match_type = 'inside' THEN 1 ELSE 0 END) AS inside_count,
        SUM(CASE WHEN m.match_type = '100m' THEN 1 ELSE 0 END) AS near_count
    FROM {schema}.maintenance_area a
    LEFT JOIN {schema}.building_area_match m
      ON a.area_id = m.area_id
    WHERE a.area_year = %s
    GROUP BY
        a.area_id,
        a.area_name,
        a.sido,
        a.sigungu,
        a.geom
    ORDER BY a.area_name;
    """

    building_sql = f"""
    SELECT
        m.pnu,
        m.area_id,
        m.in_area,
        m.distance_meter,
        m.match_type,

        b.bld_nm,

        concat_ws(' ',
            b.ct_pvc_nm,
            b.ct_gun_gu_nm,
            b.up_myun_dong_nm,
            NULLIF(NULLIF(trim(b.ri_nm), ''), '#'),
            CASE
                WHEN b.sub_house_num_ctt IS NOT NULL
                     AND trim(b.sub_house_num_ctt::text) <> ''
                     AND b.sub_house_num_ctt::text <> '0'
                THEN b.main_house_num_ctt::text || '-' || b.sub_house_num_ctt::text
                ELSE b.main_house_num_ctt::text
            END
        ) AS jibun_address,

        concat_ws(' ',
            b.ct_pvc_nm,
            b.ct_gun_gu_nm,
            rnc.road_nm,
            CASE
                WHEN b.bld_sub_num IS NOT NULL
                     AND trim(b.bld_sub_num::text) <> ''
                     AND b.bld_sub_num::text <> '0'
                THEN b.bld_main_num::text || '-' || b.bld_sub_num::text
                ELSE b.bld_main_num::text
            END
        ) AS road_address,

        b.avail_gen_cnt,
        b.int_scrbr_cnt,
        b.tv_scrbr_cnt,
        b.skb_pop_cnt,
        b.catv_digital_cnt,
        b.catv_internet_cnt,
        b.catv_8vsb_cnt,

        ST_Y(ST_GeomFromText(b.wgs84_val, 4326)) AS lat,
        ST_X(ST_GeomFromText(b.wgs84_val, 4326)) AS lng

    FROM {schema}.building_area_match m
    JOIN swing.bld_integ_info b
      ON b.pnu = m.pnu
    LEFT JOIN {schema}.road_name_code rnc
      ON rnc.rn_code = b.st_nm_cd::text
    WHERE m.area_id = %s
      AND b.wgs84_val IS NOT NULL
      AND b.wgs84_val LIKE 'POINT%%'
    ORDER BY
        CASE WHEN m.match_type = 'inside' THEN 0 ELSE 1 END,
        m.distance_meter ASC;
    """

    areas_index = []
    exported_count = 0
    changed_count = 0

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(area_sql, (year,))
            areas = cur.fetchall()

            log(f"[JSON] 정비구역 {len(areas):,}개 조회")

            for idx, area in enumerate(areas, start=1):
                # 중요: 한글 area_name 대신 area_id 기준 파일명 사용
                filename = safe_filename(area["area_id"])

                cur.execute(building_sql, (area["area_id"],))
                buildings = cur.fetchall()

                area_json = {
                    "area": {
                        "area_id": area["area_id"],
                        "area_name": area["area_name"],
                        "sido": area["sido"],
                        "sigungu": area["sigungu"],
                        "geojson": area["geojson"],
                        "center": [
                            to_float(area["center_lat"]),
                            to_float(area["center_lng"])
                        ],
                        "building_count": to_int(area["building_count"]),
                        "inside_count": to_int(area["inside_count"]),
                        "near_count": to_int(area["near_count"])
                    },
                    "buildings": [
                        {
                            "pnu": b["pnu"],
                            "match_type": b["match_type"],
                            "in_area": bool(b["in_area"]),
                            "distance_meter": to_float(b["distance_meter"]),

                            "bld_nm": b["bld_nm"],
                            "jibun_addr": b["jibun_address"],
                            "road_addr": b["road_address"],

                            "avail_gen_cnt": to_int(b["avail_gen_cnt"]),
                            "int_scrbr_cnt": to_int(b["int_scrbr_cnt"]),
                            "tv_scrbr_cnt": to_int(b["tv_scrbr_cnt"]),
                            "skb_pop_cnt": to_int(b["skb_pop_cnt"]),
                            "catv_digital_cnt": to_int(b["catv_digital_cnt"]),
                            "catv_internet_cnt": to_int(b["catv_internet_cnt"]),
                            "catv_8vsb_cnt": to_int(b["catv_8vsb_cnt"]),

                            "lat": to_float(b["lat"]),
                            "lng": to_float(b["lng"])
                        }
                        for b in buildings
                    ]
                }

                changed = write_json_if_changed(area_dir / filename, area_json)
                if changed:
                    changed_count += 1

                areas_index.append({
                    "area_id": area["area_id"],
                    "area_name": area["area_name"],
                    "file": filename,
                    "center": [
                        to_float(area["center_lat"]),
                        to_float(area["center_lng"])
                    ],
                    "building_count": to_int(area["building_count"]),
                    "inside_count": to_int(area["inside_count"]),
                    "near_count": to_int(area["near_count"])
                })

                exported_count += 1
                status = "변경" if changed else "동일"
                log(f"[JSON] {idx}/{len(areas)} {area['area_name']} / 건물 {len(buildings):,}건 / {status}")

    index_changed = write_json_if_changed(data_dir / "areas.json", areas_index)
    if index_changed:
        changed_count += 1

    log(f"[완료] JSON 생성 완료: {exported_count:,}개 구역")
    log(f"[완료] 변경된 JSON 파일: {changed_count:,}개")
    return exported_count