import { CurriculumUnit } from './types';

export const ELEMENTARY_SCHOOL_CURRICULUM: Record<string, CurriculumUnit[]> = {
  '1학년 1학기': [
    { name: '9까지의 수', subUnits: [{ name: '수 세기' }, { name: '순서 알아보기' }] },
    { name: '여러 가지 모양', subUnits: [{ name: '모양 찾기' }, { name: '모양 만들기' }] },
    { name: '덧셈과 뺄셈', subUnits: [{ name: '가르기와 모으기' }, { name: '덧셈' }, { name: '뺄셈' }] },
    { name: '비교하기', subUnits: [{ name: '길이/무게/넓이 비교' }] },
    { name: '50까지의 수', subUnits: [{ name: '수의 순서' }, { name: '수의 크기 비교' }] }
  ],
  '1학년 2학기': [
    { name: '100까지의 수', subUnits: [{ name: '몇십 몇' }, { name: '수의 순서' }, { name: '수의 크기 비교' }] },
    { name: '덧셈과 뺄셈(1)', subUnits: [{ name: '받아올림/내림이 없는 덧셈과 뺄셈' }] },
    { name: '여러 가지 모양', subUnits: [{ name: '세모, 네모, 동그라미' }] },
    { name: '덧셈과 뺄셈(2)', subUnits: [{ name: '세 수의 계산' }] },
    { name: '시계 보기와 규칙 찾기', subUnits: [{ name: '몇 시, 몇 시 30분' }, { name: '규칙 찾기' }] },
    { name: '덧셈과 뺄셈(3)', subUnits: [{ name: '10을 이용한 덧셈과 뺄셈' }] }
  ],
  '2학년 1학기': [
    { name: '세 자리 수', subUnits: [{ name: '백, 몇백' }, { name: '세 자리 수의 크기 비교' }] },
    { name: '여러 가지 도형', subUnits: [{ name: '삼각형, 사각형, 원' }, { name: '칠교판으로 모양 만들기' }] },
    { name: '덧셈과 뺄셈', subUnits: [{ name: '받아올림/내림이 있는 덧셈과 뺄셈' }] },
    { name: '길이 재기', subUnits: [{ name: 'cm 단위' }, { name: '자로 길이 재기' }] },
    { name: '분류하기', subUnits: [{ name: '기준에 따라 분류하기' }] },
    { name: '곱셈', subUnits: [{ name: '배의 개념' }, { name: '곱셈식' }] }
  ],
  '2학년 2학기': [
    { name: '네 자리 수', subUnits: [{ name: '천, 몇천' }, { name: '네 자리 수의 크기 비교' }] },
    { name: '곱셈구구', subUnits: [{ name: '2단~9단 곱셈구구' }] },
    { name: '길이 재기', subUnits: [{ name: 'm 단위' }, { name: '길이의 합과 차' }] },
    { name: '시각과 시간', subUnits: [{ name: '몇 시 몇 분' }, { name: '시간 구하기' }] },
    { name: '표와 그래프', subUnits: [{ name: '자료 조사' }, { name: '표와 그래프로 나타내기' }] },
    { name: '규칙 찾기', subUnits: [{ name: '수 배열표의 규칙' }, { name: '무늬 꾸미기' }] }
  ],
  '3학년 1학기': [
    { name: '덧셈과 뺄셈', subUnits: [{ name: '세 자리 수의 덧셈과 뺄셈' }] },
    { name: '평면도형', subUnits: [{ name: '선분, 반직선, 직선' }, { name: '각, 직각' }, { name: '직각삼각형, 직사각형, 정사각형' }] },
    { name: '나눗셈', subUnits: [{ name: '나눗셈의 의미' }, { name: '곱셈과 나눗셈의 관계' }] },
    { name: '곱셈', subUnits: [{ name: '(두 자리 수)×(한 자리 수)' }] },
    { name: '길이와 시간', subUnits: [{ name: 'mm, km 단위' }, { name: '시간의 덧셈과 뺄셈' }] },
    { name: '분수와 소수', subUnits: [{ name: '분수' }, { name: '소수' }] }
  ],
  '3학년 2학기': [
    { name: '곱셈', subUnits: [{ name: '(세 자리 수)×(한 자리 수)' }, { name: '(두 자리 수)×(두 자리 수)' }] },
    { name: '나눗셈', subUnits: [{ name: '(두/세 자리 수)÷(한 자리 수)' }] },
    { name: '원', subUnits: [{ name: '원의 중심, 반지름, 지름' }, { name: '컴퍼스 사용법' }] },
    { name: '분수', subUnits: [{ name: '가분수와 대분수' }] },
    { name: '들이와 무게', subUnits: [{ name: 'L, mL 단위' }, { name: 'kg, g, t 단위' }] },
    { name: '자료의 정리', subUnits: [{ name: '표와 그림그래프' }] }
  ],
  '4학년 1학기': [
    { name: '큰 수', subUnits: [{ name: '만, 억, 조' }, { name: '큰 수의 크기 비교' }] },
    { name: '각도', subUnits: [{ name: '각의 크기 재기' }, { name: '각의 합과 차' }, { name: '삼각형/사각형의 내각의 합' }] },
    { name: '곱셈과 나눗셈', subUnits: [{ name: '세 자리 수의 곱셈' }, { name: '두 자리 수로 나누기' }] },
    { name: '평면도형의 이동', subUnits: [{ name: '밀기, 뒤집기, 돌리기' }] },
    { name: '막대그래프', subUnits: [{ name: '막대그래프 그리기와 해석' }] },
    { name: '규칙 찾기', subUnits: [{ name: '수의 배열 규칙' }, { name: '도형의 배열 규칙' }] }
  ],
  '4학년 2학기': [
    { name: '분수의 덧셈과 뺄셈', subUnits: [{ name: '분모가 같은 분수의 덧셈과 뺄셈' }] },
    { name: '삼각형', subUnits: [{ name: '이등변삼각형, 정삼각형' }, { name: '예각, 직각, 둔각삼각형' }] },
    { name: '소수의 덧셈과 뺄셈', subUnits: [{ name: '소수 두/세 자리 수' }, { name: '소수의 덧셈과 뺄셈' }] },
    { name: '사각형', subUnits: [{ name: '사다리꼴, 평행사변형, 마름모' }, { name: '직사각형, 정사각형' }] },
    { name: '꺾은선그래프', subUnits: [{ name: '꺾은선그래프 그리기와 해석' }] },
    { name: '다각형', subUnits: [{ name: '다각형과 정다각형' }, { name: '대각선' }] }
  ],
  '5학년 1학기': [
    { name: '자연수의 혼합 계산', subUnits: [{ name: '덧셈, 뺄셈, 곱셈, 나눗셈의 혼합' }] },
    { name: '약수와 배수', subUnits: [{ name: '약수와 배수' }, { name: '공약수와 최대공약수' }, { name: '공배수와 최소공배수' }] },
    { name: '규칙과 대응', subUnits: [{ name: '두 양 사이의 관계' }] },
    { name: '약분과 통분', subUnits: [{ name: '크기가 같은 분수' }, { name: '약분과 통분' }, { name: '분수의 크기 비교' }] },
    { name: '분수의 덧셈과 뺄셈', subUnits: [{ name: '분모가 다른 분수의 덧셈과 뺄셈' }] },
    { name: '다각형의 둘레와 넓이', subUnits: [{ name: '둘레 구하기' }, { name: '단위넓이' }, { name: '직사각형, 평행사변형, 삼각형, 마름모, 사다리꼴의 넓이' }] }
  ],
  '5학년 2학기': [
    { name: '수의 범위와 어림하기', subUnits: [{ name: '이상, 이하, 초과, 미만' }, { name: '올림, 버림, 반올림' }] },
    { name: '분수의 곱셈', subUnits: [{ name: '(분수)×(자연수)' }, { name: '(자연수)×(분수)' }, { name: '(분수)×(분수)' }] },
    { name: '합동과 대칭', subUnits: [{ name: '도형의 합동' }, { name: '선대칭도형과 점대칭도형' }] },
    { name: '소수의 곱셈', subUnits: [{ name: '(소수)×(자연수)' }, { name: '(자연수)×(소수)' }, { name: '(소수)×(소수)' }] },
    { name: '직육면체', subUnits: [{ name: '직육면체와 정육면체' }, { name: '겨냥도와 전개도' }] },
    { name: '평균과 가능성', subUnits: [{ name: '평균' }, { name: '일이 일어날 가능성' }] }
  ],
  '6학년 1학기': [
    { name: '분수의 나눗셈', subUnits: [{ name: '(자연수)÷(자연수)' }, { name: '(분수)÷(자연수)' }] },
    { name: '각기둥과 각뿔', subUnits: [{ name: '각기둥' }, { name: '각뿔' }] },
    { name: '소수의 나눗셈', subUnits: [{ name: '(소수)÷(자연수)' }, { name: '(자연수)÷(자연수)' }] },
    { name: '비와 비율', subUnits: [{ name: '비와 비율' }, { name: '백분율' }] },
    { name: '여러 가지 그래프', subUnits: [{ name: '그림그래프' }, { name: '띠그래프와 원그래프' }] },
    { name: '직육면체의 부피와 겉넓이', subUnits: [{ name: '직육면체의 부피' }, { name: '직육면체의 겉넓이' }] }
  ],
  '6학년 2학기': [
    { name: '분수의 나눗셈', subUnits: [{ name: '(분수)÷(분수)' }] },
    { name: '소수의 나눗셈', subUnits: [{ name: '(소수)÷(소수)' }] },
    { name: '공간과 입체', subUnits: [{ name: '쌓기나무' }] },
    { name: '비례식과 비례배분', subUnits: [{ name: '비례식' }, { name: '비례배분' }] },
    { name: '원의 넓이', subUnits: [{ name: '원주와 원주율' }, { name: '원의 넓이' }] },
    { name: '원기둥, 원뿔, 구', subUnits: [{ name: '원기둥' }, { name: '원뿔' }, { name: '구' }] }
  ]
};

export const MIDDLE_SCHOOL_CURRICULUM: Record<string, CurriculumUnit[]> = {
  '1학년 1학기': [
    {
      name: '수와 연산',
      subUnits: [
        { name: '소인수분해', subUnits: [{ name: '소인수분해' }, { name: '최대공약수와 최소공배수' }] },
        { name: '정수와 유리수', subUnits: [{ name: '정수와 유리수' }, { name: '정수와 유리수의 덧셈과 뺄셈' }, { name: '정수와 유리수의 곱셈과 나눗셈' }] }
      ]
    },
    {
      name: '문자와 식',
      subUnits: [
        { name: '문자의 사용과 식', subUnits: [{ name: '문자의 사용과 식의 계산' }, { name: '일차식의 덧셈과 뺄셈' }] },
        { name: '일차방정식', subUnits: [{ name: '일차방정식의 풀이' }, { name: '일차방정식의 활용' }] }
      ]
    },
    {
      name: '좌표평면과 그래프',
      subUnits: [
        { name: '좌표와 그래프', subUnits: [{ name: '순서쌍과 좌표' }, { name: '그래프' }] },
        { name: '정비례와 반비례', subUnits: [{ name: '정비례' }, { name: '반비례' }] }
      ]
    }
  ],
  '1학년 2학기': [
    {
      name: '기하',
      subUnits: [
        { name: '기본 도형', subUnits: [{ name: '점·선·면·각' }, { name: '위치 관계' }, { name: '평행선의 성질' }] },
        { name: '작도와 합동', subUnits: [{ name: '삼각형의 작도' }, { name: '삼각형의 합동' }] },
        { name: '평면도형', subUnits: [{ name: '다각형' }, { name: '원과 부채꼴' }] },
        { name: '입체도형', subUnits: [{ name: '다면체' }, { name: '회전체' }, { name: '입체도형의 겉넓이와 부피' }] }
      ]
    },
    {
      name: '통계',
      subUnits: [
        { name: '자료의 정리와 해석', subUnits: [{ name: '줄기와 잎 그림·도수분포표' }, { name: '히스토그램과 도수분포다각형' }, { name: '상대도수' }] }
      ]
    }
  ],
  '2학년 1학기': [
    {
      name: '수와 연산',
      subUnits: [
        { name: '유리수와 순환소수', subUnits: [{ name: '유리수와 순환소수' }] }
      ]
    },
    {
      name: '문자와 식',
      subUnits: [
        { name: '식의 계산', subUnits: [{ name: '단항식의 계산' }, { name: '다항식의 계산' }] }
      ]
    },
    {
      name: '부등식과 방정식',
      subUnits: [
        { name: '일차부등식', subUnits: [{ name: '부등식의 성질' }, { name: '일차부등식의 풀이와 활용' }] },
        { name: '연립일차방정식', subUnits: [{ name: '연립일차방정식의 풀이' }, { name: '연립일차방정식의 활용' }] }
      ]
    },
    {
      name: '함수',
      subUnits: [
        { name: '일차함수', subUnits: [{ name: '일차함수와 그 그래프' }, { name: '일차함수와 일차방정식의 관계' }] }
      ]
    }
  ],
  '2학년 2학기': [
    {
      name: '기하',
      subUnits: [
        { name: '삼각형의 성질', subUnits: [{ name: '이등변삼각형의 성질' }, { name: '직각삼각형의 합동' }, { name: '삼각형의 외심과 내심' }] },
        { name: '사각형의 성질', subUnits: [{ name: '평행사변형' }, { name: '여러 가지 사각형' }] },
        { name: '도형의 닮음', subUnits: [{ name: '도형의 닮음' }, { name: '평행선 사이의 선분의 길이의 비' }, { name: '삼각형의 무게중심' }] },
        { name: '피타고라스 정리', subUnits: [{ name: '피타고라스 정리' }] }
      ]
    },
    {
      name: '확률',
      subUnits: [
        { name: '확률', subUnits: [{ name: '경우의 수' }, { name: '확률의 뜻과 성질' }, { name: '확률의 계산' }] }
      ]
    }
  ],
  '3학년 1학기': [
    {
      name: '수와 연산',
      subUnits: [
        { name: '실수와 그 연산', subUnits: [{ name: '제곱근과 실수' }, { name: '근호를 포함한 식의 계산' }] }
      ]
    },
    {
      name: '문자와 식',
      subUnits: [
        { name: '다항식의 곱셈과 인수분해', subUnits: [{ name: '다항식의 곱셈' }, { name: '다항식의 인수분해' }] },
        { name: '이차방정식', subUnits: [{ name: '이차방정식의 풀이' }, { name: '이차방정식의 활용' }] }
      ]
    },
    {
      name: '함수',
      subUnits: [
        { name: '이차함수', subUnits: [{ name: '이차함수와 그 그래프' }] }
      ]
    }
  ],
  '3학년 2학기': [
    {
      name: '기하',
      subUnits: [
        { name: '삼각비', subUnits: [{ name: '삼각비' }, { name: '삼각비의 활용' }] },
        { name: '원의 성질', subUnits: [{ name: '원과 현' }, { name: '원과 접선' }, { name: '원주각' }] }
      ]
    },
    {
      name: '통계',
      subUnits: [
        { name: '통계', subUnits: [{ name: '대푯값과 산포도' }, { name: '상관관계' }] }
      ]
    }
  ]
};

export const HIGH_SCHOOL_CURRICULUM: Record<string, CurriculumUnit[]> = {
  '공통수학1': [
    {
      name: '다항식',
      subUnits: [
        { name: '다항식의 연산', subUnits: [{ name: '다항식의 덧셈과 뺄셈' }, { name: '다항식의 곱셈과 나눗셈' }] },
        { name: '나머지정리', subUnits: [{ name: '항등식' }, { name: '나머지정리와 인수정리' }, { name: '조립제법' }] },
        { name: '인수분해', subUnits: [{ name: '인수분해' }] }
      ]
    },
    {
      name: '방정식과 부등식',
      subUnits: [
        { name: '복소수', subUnits: [{ name: '복소수' }, { name: '복소수의 연산' }] },
        { name: '이차방정식', subUnits: [{ name: '이차방정식의 판별식' }, { name: '이차방정식의 근과 계수의 관계' }] },
        { name: '이차방정식과 이차함수', subUnits: [{ name: '이차방정식과 이차함수의 관계' }, { name: '이차함수의 최대·최소' }] },
        { name: '여러 가지 방정식과 부등식', subUnits: [{ name: '삼차방정식과 사차방정식' }, { name: '연립이차방정식' }, { name: '연립일차부등식' }, { name: '이차부등식과 연립이차부등식' }] }
      ]
    },
    {
      name: '경우의 수',
      subUnits: [
        { name: '경우의 수', subUnits: [{ name: '합의 법칙과 곱의 법칙' }] },
        { name: '순열과 조합', subUnits: [{ name: '순열' }, { name: '조합' }] }
      ]
    },
    {
      name: '행렬',
      subUnits: [
        { name: '행렬', subUnits: [{ name: '행렬과 그 연산' }] }
      ]
    }
  ],
  '공통수학2': [
    {
      name: '도형의 방정식',
      subUnits: [
        { name: '평면좌표', subUnits: [{ name: '두 점 사이의 거리' }, { name: '선분의 내분점' }] },
        { name: '직선의 방정식', subUnits: [{ name: '직선의 방정식' }, { name: '두 직선의 위치 관계' }, { name: '점과 직선 사이의 거리' }] },
        { name: '원의 방정식', subUnits: [{ name: '원의 방정식' }, { name: '원과 직선의 위치 관계' }] },
        { name: '도형의 이동', subUnits: [{ name: '평행이동' }, { name: '대칭이동' }] }
      ]
    },
    {
      name: '집합과 명제',
      subUnits: [
        { name: '집합', subUnits: [{ name: '집합의 뜻과 표현' }, { name: '집합의 연산' }] },
        { name: '명제', subUnits: [{ name: '명제와 조건' }, { name: '명제 사이의 관계(역·대우)' }, { name: '충분조건과 필요조건' }, { name: '절대부등식' }] }
      ]
    },
    {
      name: '함수와 그래프',
      subUnits: [
        { name: '함수', subUnits: [{ name: '함수' }, { name: '합성함수와 역함수' }] },
        { name: '유리함수와 무리함수', subUnits: [{ name: '유리함수' }, { name: '무리함수' }] }
      ]
    }
  ],
  '대수': [
    {
      name: '지수함수와 로그함수',
      subUnits: [
        { name: '지수와 로그', subUnits: [{ name: '지수' }, { name: '로그' }] },
        { name: '지수함수와 로그함수', subUnits: [{ name: '지수함수' }, { name: '로그함수' }, { name: '지수함수와 로그함수의 활용' }] }
      ]
    },
    {
      name: '삼각함수',
      subUnits: [
        { name: '삼각함수', subUnits: [{ name: '삼각함수' }, { name: '삼각함수의 그래프' }, { name: '삼각함수의 활용' }] }
      ]
    },
    {
      name: '수열',
      subUnits: [
        { name: '등차수열과 등비수열', subUnits: [{ name: '등차수열' }, { name: '등비수열' }] },
        { name: '수열의 합', subUnits: [{ name: '합의 기호 시그마' }, { name: '여러 가지 수열의 합' }] },
        { name: '수학적 귀납법', subUnits: [{ name: '수학적 귀납법' }] }
      ]
    },
    {
      name: '수학적 모델링',
      subUnits: [
        { name: '수학적 모델링', subUnits: [{ name: '수학적 모델링' }] }
      ]
    }
  ],
  '미적분I': [
    {
      name: '함수의 극한과 연속',
      subUnits: [
        { name: '함수의 극한', subUnits: [{ name: '함수의 극한' }, { name: '함수의 극한에 대한 성질' }] },
        { name: '함수의 연속', subUnits: [{ name: '함수의 연속' }] }
      ]
    },
    {
      name: '미분',
      subUnits: [
        { name: '미분계수와 도함수', subUnits: [{ name: '미분계수' }, { name: '도함수' }] },
        { name: '도함수의 활용', subUnits: [{ name: '접선의 방정식' }, { name: '평균값 정리' }, { name: '함수의 증가와 감소·극대와 극소' }, { name: '함수의 그래프' }, { name: '방정식과 부등식에의 활용' }, { name: '속도와 가속도' }] }
      ]
    },
    {
      name: '적분',
      subUnits: [
        { name: '부정적분', subUnits: [{ name: '부정적분' }] },
        { name: '정적분', subUnits: [{ name: '정적분' }] },
        { name: '정적분의 활용', subUnits: [{ name: '넓이' }, { name: '속도와 거리' }] }
      ]
    }
  ],
  '확률과 통계': [
    {
      name: '경우의 수',
      subUnits: [
        { name: '경우의 수', subUnits: [{ name: '중복순열' }, { name: '중복조합' }] },
        { name: '이항정리', subUnits: [{ name: '이항정리' }] }
      ]
    },
    {
      name: '확률',
      subUnits: [
        { name: '확률의 뜻과 활용', subUnits: [{ name: '확률의 뜻' }, { name: '확률의 덧셈정리' }] },
        { name: '조건부확률', subUnits: [{ name: '조건부확률' }, { name: '사건의 독립과 종속' }] }
      ]
    },
    {
      name: '통계',
      subUnits: [
        { name: '확률분포', subUnits: [{ name: '확률변수와 확률분포' }, { name: '이산확률변수와 이항분포' }, { name: '연속확률변수와 정규분포' }] },
        { name: '통계적 추정', subUnits: [{ name: '모집단과 표본' }, { name: '모평균의 추정' }, { name: '모비율의 추정' }] }
      ]
    }
  ],
  '미적분II': [
    {
      name: '수열의 극한',
      subUnits: [
        { name: '수열의 극한', subUnits: [{ name: '수열의 극한' }, { name: '급수' }] }
      ]
    },
    {
      name: '미분법',
      subUnits: [
        { name: '여러 가지 함수의 미분', subUnits: [{ name: '지수함수와 로그함수의 미분' }, { name: '삼각함수의 미분' }] },
        { name: '여러 가지 미분법', subUnits: [{ name: '여러 가지 미분법' }, { name: '도함수의 활용' }] }
      ]
    },
    {
      name: '적분법',
      subUnits: [
        { name: '여러 가지 적분법', subUnits: [{ name: '여러 가지 적분법' }] },
        { name: '정적분의 활용', subUnits: [{ name: '정적분과 급수' }, { name: '넓이와 부피' }] }
      ]
    }
  ],
  '기하': [
    {
      name: '이차곡선',
      subUnits: [
        { name: '이차곡선', subUnits: [{ name: '포물선' }, { name: '타원' }, { name: '쌍곡선' }] },
        { name: '이차곡선과 직선', subUnits: [{ name: '이차곡선과 직선의 위치 관계' }, { name: '접선의 방정식' }] }
      ]
    },
    {
      name: '평면벡터',
      subUnits: [
        { name: '벡터의 연산', subUnits: [{ name: '벡터의 뜻과 연산' }] },
        { name: '평면벡터의 성분과 내적', subUnits: [{ name: '위치벡터' }, { name: '평면벡터의 성분' }, { name: '평면벡터의 내적' }, { name: '직선과 원의 방정식' }] }
      ]
    },
    {
      name: '공간도형과 공간좌표',
      subUnits: [
        { name: '공간도형', subUnits: [{ name: '직선과 평면의 위치 관계' }, { name: '정사영' }] },
        { name: '공간좌표', subUnits: [{ name: '점의 좌표' }, { name: '두 점 사이의 거리' }] }
      ]
    }
  ]
};