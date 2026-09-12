# HWP 도형 내보내기 수정 (2026-09-12)

사용자의 도형 포함 요청에 따라 기존 D8/§39의 “그림 자리 안내문만 내보내기” 정책을 대체한다.

- 일반 내보내기는 `renderFigures: true`와 `figure.crop`을 보낸다. 화면에 보이는 최종 SVG/이미지를 PNG로 변환하므로 수식 라벨과 수동 편집이 보존된다. 본문·보기·소문항의 `[그림N]` 위치를 유지한다.
- 도우미 1.3.0의 `v2-figures` capability가 필요하다. 구버전에서는 업데이트를 안내한다. `adapter`가 figure를 보존하고 `convert_cli`가 파싱 전에 검증된 PNG로 바꾼다. 이미지 실패를 성공한 파일로 숨기지 않는다.
- 고해상도 그림은 한글 COM의 명시적 mm 크기로 삽입하여 2단 너비를 넘지 않도록 한다. PNG 픽셀은 유지한다.
- 기존 기출은 `mathgen-figures` **비공개 버킷**의 복원 매니페스트를 인증된 API에서 읽는다. 원본 PDF의 1-based 페이지와 좌상단 기준 PDF point 좌표를 사용한다. DB의 `has_figure`는 보기 속 그림을 누락하므로 전체 문항을 재귀 순회한다.
- 원본 PDF 문항번호 앵커로 소속이 확정된 그림은 올바른 문항으로 이동한다. DB 원문은 변경하지 않는다. 매니페스트 키는 원본 문항 ID·페이지·bbox이며, 좌표가 달라진 OCR에는 이전 그림을 붙이지 않는다.
- 원본 좌표가 없는 예전 OCR은 자동 복원 대상에서 제외한다. 누락된 그림이 있는 원본 서식 내보내기는 중단하고 원본 PDF를 이용한 복원/재인식을 안내한다.
- Chrome/Edge의 loopback 접근 거부를 도우미 미설치로 단정하지 않는다. 권한 조회가 가능한 경우 차단 상태를 알리고, 그 밖의 연결 오류에는 도우미 실행과 사이트 권한을 함께 안내한다. 보안 설정을 자동으로 변경하지 않는다.
- 다운로드 확장자는 도우미 health가 아닌 실제 파일 시그니처(HWP CFB / HWPX ZIP)로 결정한다.

복원 실행:

```powershell
node --env-file=.env.local scripts/testchangeFigureAssets.mjs 'D:/시험지 한글화/db/pages' --upload
```

검증:

```powershell
node scripts/runHarness.mjs scripts/hwpExportHarness.mts
npx tsc --noEmit --pretty false
npm run build
# testchange 엔진
py -3.11 -m pytest tests/test_mathgen_figures.py tests/test_connector_contract.py tests/test_helper_config.py -q
py -3.11 scripts/verify_output_format.py --all
```

도우미는 testchange 최신 커밋 기반의 별도 체크아웃에서 빌드한다. 기존 작업 폴더의 다른 수정은 포함하지 않는다. 공개 ZIP에는 config/API 키·비공개 대수회 폼을 넣지 않는다. 로컬 업데이트는 기존 config·폼·연결 코드를 유지한다.
