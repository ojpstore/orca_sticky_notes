# 스티커 메모

Windows 스티커 메모를 Orca 오른쪽 사이드바 패널로 옮긴 플러그인입니다. 메모는 플러그인 전용 저장소(`storage:own`)에 저장됩니다.

목록 하단의 **백업**은 메모를 JSON 파일로 저장하고, **임포트**는 백업 파일의 메모를 현재 메모에 합칩니다. 임포트는 기존 메모를 지우지 않으며, 같은 메모는 더 최근에 수정된 쪽을 남깁니다.

## 개발

```sh
orca plugin validate .
orca plugin test .
orca plugin dev watch .    # 첫 로드 때 권한 승인 필요
```
