export const CONNECTOR_ACCESS_HELP = 'HWP 도우미를 실행한 뒤, 주소창 왼쪽 사이트 설정에서 “로컬 네트워크” 또는 “이 기기의 앱” 접근을 허용하고 다시 시도해 주세요.';
export const HWP_AGENT_DOWNLOAD_URL = 'https://github.com/BIGSHOL/Math-Gen/releases/latest/download/MathGenHWP.zip';

/** Unknown permission names reject on older browsers; fetch remains the connection test. */
export async function connectorAccessMessage(): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.permissions) {
    for (const name of ['loopback-network', 'local-network-access']) {
      try {
        const result = await navigator.permissions.query({ name } as PermissionDescriptor);
        if (result.state === 'denied') return `브라우저가 HWP 도우미 접근을 차단했습니다. ${CONNECTOR_ACCESS_HELP}`;
        break;
      } catch { /* The previous permission name may be supported. */ }
    }
  }
  // A fetch TypeError cannot reliably distinguish a stopped helper from a permission block.
  return `HWP 도우미에 연결하지 못했습니다. ${CONNECTOR_ACCESS_HELP}`;
}

export async function hwpExtension(blob: Blob): Promise<'hwp' | 'hwpx'> {
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'hwpx';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'hwp';
  throw new Error('도우미가 올바른 한글 파일을 반환하지 않았습니다.');
}
