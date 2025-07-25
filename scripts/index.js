import { PUBLIC_PREF_LCE_CODES_XLSX, PUBLIC_SLCE_XLSX } from './consts.js';
import fetch from 'node-fetch';
import * as XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

async function downloadWorkbook(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  return XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
}

function ensureDir(filePath) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
}

async function main() {
  // 1つ目: 全てのシートを処理
  const workbook1 = await downloadWorkbook(PUBLIC_PREF_LCE_CODES_XLSX);
  const keys1 = ['団体コード', '都道府県名（漢字）', '市区町村名（漢字）', '都道府県名（カナ）', '市区町村名（カナ）'];
  const json1_raw = workbook1.SheetNames.flatMap(sheetName => {
    const sheet = workbook1.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    return data
      .slice(1) // ヘッダー行をスキップ
      .filter(row => row && row[0]) // 団体コードが存在する行のみを対象
      .map(row => Object.fromEntries(keys1.map((k, i) => [k, row[i]])));
  });
  // 団体コードに基づいて重複を排除
  const uniqueMap1 = new Map();
  json1_raw.forEach(item => {
    if (!uniqueMap1.has(item['団体コード'])) {
      uniqueMap1.set(item['団体コード'], item);
    }
  });
  const json1 = Array.from(uniqueMap1.values());
  ensureDir('public/pref_lce.json');
  writeFileSync('public/pref_lce.json', JSON.stringify(json1, null, 4), 'utf-8');

  // 2つ目: B列から始まるデータを処理
  const workbook2 = await downloadWorkbook(PUBLIC_SLCE_XLSX);
  const sheet2 = workbook2.Sheets[workbook2.SheetNames[0]];
  const data2 = XLSX.utils.sheet_to_json(sheet2, { header: 1, cellDates: true });
  const keys2 = ['コード', '一部事務組合等の名称', 'ふりがな', '設立年月日', '郵便番号', '所在地', '電話番号'];
  const json2 = data2
    .slice(3) // 4行目から処理を開始
    .filter(row => row && row.length >= keys2.length + 1 && row[1]) // B列(コード)が存在し、データが十分ある行のみ対象
    .map(row => Object.fromEntries(keys2.map((k, i) => {
      let val = row[i + 1];
      if (k === '設立年月日' && val instanceof Date && !isNaN(val)) {
        const year = val.getFullYear();
        const month = String(val.getMonth() + 1).padStart(2, '0');
        const day = String(val.getDate()).padStart(2, '0');
        val = `${year}-${month}-${day}`;
      }
      return [k, val];
    })));
  ensureDir('public/slce.json');
  writeFileSync('public/slce.json', JSON.stringify(json2, null, 4), 'utf-8');

  // 3つ目: 1と2を結合して joint_all.json を作成
  const joint1 = json1.map(item => ({
    code: item['団体コード'],
    // 市区町村名（漢字）が存在しない場合は、都道府県名（漢字）を使用
    name: item['市区町村名（漢字）'] || item['都道府県名（漢字）'],
  }));

  const joint2 = json2.map(item => ({
    code: item['コード'],
    name: item['一部事務組合等の名称'],
  }));

  const jointAll = [...joint1, ...joint2];

  ensureDir('public/joint_all.json');
  writeFileSync('public/joint_all.json', JSON.stringify(jointAll, null, 4), 'utf-8');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
