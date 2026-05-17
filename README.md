# 오버워치 스크림 분석기

## 구동 방법 (Env: dev)

```
개발환경 PowerShell 기준으로 작성되었습니다.
```

### Backend

#### 설치

```
python -m venv backend\venv # 가상환경 생성
.\backend\venv\Scripts\Activate.ps1 # 가상환경 활성화
pip install -e .\backend\ # API 서버 패키지 설치
```

#### 실행

```
.\backend\venv\Scripts\Activate.ps1 # 가상환경 활성화
python -m ow_analyzer_runnerleague # 실행
```

### Frontend

#### 설치

```
cd frontend
npm install # 노드 모듈 설치
```

#### 실행

```
npm run dev # 실행
```
