# MathGen HWP 변환 전략

작성일: 2026-06-11

## 결론

MathGen의 본체는 웹 기반 시험지 데이터화/검수 플랫폼으로 유지한다. HWP 변환은 모든 사용자에게 필수로 강제하지 않고, 신뢰하고 설치한 사용자만 사용하는 선택형 고급 출력 기능으로 분리한다.

최종 제품 포지션은 다음과 같다.

```text
MathGen Web
= PDF 업로드, OCR, KaTeX 검수, 문제 편집, 기본 내보내기

MathGen HWP Connector for Windows
= 사용자의 PC에 설치된 한글 프로그램을 이용하는 선택 설치형 정밀 HWP 출력 도구
```

`D:\시험지 한글화`는 사용자에게 그대로 배포하는 폴더가 아니다. 이 프로젝트는 비공개 HWP 변환 엔진 코드베이스로 유지하고, 제품화 시에는 서버 worker 또는 설치형 connector 내부 엔진으로 빌드한다.

## 전체 프로세스

```text
PDF 업로드
-> PDF 페이지 이미지화
-> AI OCR / 문항 구조화
-> KaTeX 기반 웹 검수
-> MathGen 표준 변환 JSON 생성
-> HWP 변환 요청
-> HWP Connector 또는 비공개 Windows worker 실행
-> 한글 COM / HWPX 후처리 / 수식 변환
-> .hwp 또는 .hwpx 생성
-> 사용자 다운로드
```

역할 분리는 다음과 같이 둔다.

```text
MathGen
- PDF 업로드
- 페이지 이미지화
- OCR
- 문제/수식/보기/표/그림 구조화
- KaTeX 검수 UI
- 문제 편집
- 표준 변환 JSON 생성

HWP 변환 엔진
- LaTeX -> HWP 수식 변환
- 문항번호/미주 자동번호
- 객관식/서술형 배점 처리
- 보기/조건/상자 박스
- 표 셀 수식 객체화
- 선택지 2열 정렬
- 그림 배치
- 폼 자동입력
- HWP COM 제어
- HWPX XML 후처리
```

## 배포 전략

### 기본 기능

설치 없이 웹에서 제공한다.

```text
PDF 업로드
-> OCR
-> KaTeX 검수
-> 문제 데이터 편집
-> 기본 내보내기
```

기본 내보내기는 HWP에 종속되지 않는 포맷부터 제공한다.

- JSON
- HTML
- PDF
- LaTeX/Markdown 계열
- 추후 DOCX 또는 HWPX 간단 내보내기

### 고급 기능: 정밀 HWP 출력

정밀 HWP 출력은 Windows용 `MathGen HWP Connector` 설치 사용자에게만 제공한다.

사용자 안내 문구의 기준은 다음과 같다.

```text
정밀 HWP 출력
Windows용 MathGen HWP Connector를 설치하면 사용자의 PC에 설치된 한글 프로그램을 이용해
검수된 시험지를 HWP 파일로 내보낼 수 있습니다.
```

이 방식의 목적은 다음과 같다.

- 설치를 원하지 않는 사용자는 웹 기능만 사용할 수 있게 한다.
- HWP가 꼭 필요한 사용자만 명시적으로 설치하게 한다.
- 한글 COM 의존성과 로컬 환경 문제를 고급 기능 영역으로 격리한다.
- 비공개 변환 엔진 소스가 웹 프론트엔드로 내려가지 않게 한다.
- 장기적으로 rhwp/HWPX 기반 대체 경로가 성숙하면 설치 의존도를 낮춘다.

## 코드 보호 원칙

웹 프론트엔드에 보호해야 할 핵심 로직을 넣지 않는다. 브라우저로 내려가는 JavaScript는 노출되는 것으로 본다.

로컬 connector를 배포하더라도 완전한 코드 은닉은 불가능하다. 목표는 완전 차단이 아니라 노출 난이도 상승과 핵심 로직 분리다.

지켜야 할 원칙은 다음과 같다.

- `D:\시험지 한글화` 소스 폴더를 그대로 배포하지 않는다.
- 로컬에는 가능한 한 얇은 HWP 실행기만 둔다.
- API 키, OCR 프롬프트, 서버 전용 비즈니스 로직은 connector에 포함하지 않는다.
- 핵심 OCR/정제/레이아웃 판단 로직은 가능한 서버에 둔다.
- connector는 한글 COM 연결과 최종 HWP 저장에 집중한다.
- 빌드 산출물은 코드 서명된 설치 파일로 배포한다.
- PyInstaller 단독 배포는 백신 오탐과 역분석 가능성이 있으므로 장기적으로 Nuitka, Rust, Go, .NET, MSI/MSIX 등을 검토한다.

## Connector 보안 요구사항

사용자가 해킹 우려를 덜 느끼려면 connector는 실제로도 권한과 통신 범위를 최소화해야 한다.

필수 요구사항:

- 공식 MathGen 사이트에서만 다운로드한다.
- 설치 파일과 실행 파일에 코드 서명을 적용한다.
- 가능하면 관리자 권한 없이 설치한다.
- 외부 네트워크 포트를 열지 않는다.
- `127.0.0.1` localhost에서만 대기한다.
- MathGen 공식 Origin만 허용한다.
- 계정 또는 브라우저 세션별 pairing token을 사용한다.
- 변환 요청마다 token을 검증한다.
- 임시 파일은 변환 후 자동 삭제한다.
- 사용자가 트레이 앱에서 상태 확인, 중지, 종료를 할 수 있게 한다.
- 한글 COM은 변환 시점에만 실행하거나 연결한다.

브라우저와 connector의 통신은 다음 형태를 기준으로 한다.

```text
MathGen Web
-> http://127.0.0.1:{port}/health
-> pairing token 확인
-> POST /convert
-> connector가 사용자 PC의 한글 COM으로 HWP 생성
-> 결과 파일 반환 또는 로컬 저장
```

나쁜 구조:

```text
아무 웹사이트나 인증 없이 localhost connector에 변환 요청 가능
```

좋은 구조:

```text
MathGen 공식 Origin
+ pairing token
+ 요청별 인증
+ localhost only
+ 외부 접속 차단
```

## HWP 경로 입력에 대한 결정

사용자에게 `Hwp.exe` 경로를 직접 입력하게 하는 방식은 기본 UX로 두지 않는다.

이유:

- 브라우저는 사용자의 로컬 `Hwp.exe`를 직접 실행할 수 없다.
- 한글 자동화의 핵심은 exe 경로보다 COM 등록 여부다.
- 경로를 알아도 `HWPFrame.HwpObject` COM 연결이 실패하면 변환할 수 없다.
- 일반 사용자에게 경로 입력은 신뢰와 사용성을 동시에 떨어뜨린다.

따라서 기본은 자동 진단으로 한다.

```text
한글 설치 확인
-> HWP COM 연결 테스트
-> 변환 준비 완료 표시
```

경로 입력은 자동 감지 실패 시 고급 옵션으로만 둔다.

## rhwp-main의 위치

`D:\rhwp-main`은 Rust/WASM 기반 HWP/HWPX 파서, 렌더러, 에디터, serializer 프로젝트다. MathGen과 장기적으로 궁합이 좋지만, 당장 정밀 HWP 출력의 본선 엔진으로 대체하기에는 위험하다.

현재 판단:

- 브라우저 HWPX 미리보기 후보로 좋다.
- HWPX 구조 검증과 roundtrip 실험에 유용하다.
- 장기적으로 COM 없는 HWPX 생성 엔진 후보가 될 수 있다.
- 다만 한컴 호환성, HWPX 저장 안정성, HWP 변환 완성도는 별도 검증이 필요하다.
- 시험지 한글화 엔진의 미주, 보기 박스, 수식 객체, 표 셀, 폼 자동입력 규칙을 바로 대체하지 않는다.

권장 위치:

```text
단기: MathGen preview / 검증 보조
중기: HWPX export prototype
장기: COM 의존도 축소 후보
```

## 구현 단계

### 1단계: 표준 변환 JSON 계약

MathGen 내부 상태를 HWP 변환 엔진이 받을 수 있는 표준 JSON으로 고정한다.

포함해야 할 정보:

- 시험지 제목
- 문항 번호
- 객관식/서술형 구분
- 배점
- 발문 텍스트와 LaTeX 수식
- 선택지
- 보기/조건/상자
- 표
- 그림 참조
- 정답/해설
- 폼 사용 여부

### 2단계: HWP 변환 worker API

Windows 환경에서 실행되는 worker API를 만든다.

예상 API:

```text
GET  /health
POST /convert
GET  /jobs/{jobId}
GET  /jobs/{jobId}/download
```

초기에는 개발 편의를 위해 로컬 worker로 시작할 수 있다. 제품화 시에는 중앙 Windows worker 또는 설치형 connector로 분기한다.

### 3단계: MathGen HWP Connector

설치형 connector를 만든다.

요구사항:

- localhost only
- pairing token
- Origin allowlist
- HWP COM 자동 진단
- 변환 상태 표시
- 결과 파일 저장/반환
- 자동 업데이트 고려

### 4단계: 보안 패키징

제품 배포 전 반드시 처리한다.

- 코드 서명
- 설치 파일 서명
- 관리자 권한 최소화
- SHA256 해시 공개
- 개인정보/문서 처리 안내
- 백신 오탐 확인
- 임시 파일 삭제 검증

### 5단계: rhwp 보조 적용

rhwp는 별도 트랙으로 붙인다.

- HWPX 미리보기
- HWPX export prototype
- 한컴 호환성 비교
- 시험지 한글화 엔진 출력과 diff/roundtrip 검증

## 제품 원칙

HWP 변환은 MathGen의 필수 사용 조건이 아니다. MathGen의 핵심 가치는 PDF를 수식이 살아 있는 문제 데이터로 바꾸고, 웹에서 검수/편집할 수 있게 하는 것이다.

정밀 HWP 출력은 다음 사용자에게 제공하는 고급 기능으로 둔다.

- 한글 원본 품질이 반드시 필요한 사용자
- 로컬 connector 설치를 신뢰하는 사용자
- Windows + 한컴오피스 한글 환경을 갖춘 사용자

이 원칙을 유지하면 웹 제품의 진입 장벽을 낮추면서도, HWP가 필요한 사용자에게는 강력한 출력 경로를 제공할 수 있다.
