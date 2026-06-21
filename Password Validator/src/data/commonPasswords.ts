// A small embedded sample of the most-leaked passwords. A real product would
// check a breach corpus (e.g. HIBP's k-anonymity API); this stays fully offline.

const COMMON = new Set<string>([
  'password', 'password1', 'password123', '123456', '1234567', '12345678', '123456789',
  '1234567890', 'qwerty', 'qwerty123', 'qwertyuiop', 'abc123', '111111', '000000',
  'iloveyou', 'admin', 'admin123', 'letmein', 'welcome', 'welcome1', 'monkey', 'dragon',
  'sunshine', 'princess', 'football', 'baseball', 'superman', 'batman', 'master', 'shadow',
  'michael', 'jennifer', 'trustno1', 'whatever', 'zaq12wsx', '1q2w3e4r', '1qaz2wsx',
  'passw0rd', 'p@ssw0rd', 'login', 'starwars', 'hello', 'hello123', 'freedom', 'ninja',
  'azerty', 'changeme', 'secret', 'qazwsx', 'asdfgh', 'asdfghjkl', '654321', '121212',
])

export function isCommonPassword(password: string): boolean {
  return COMMON.has(password.toLowerCase())
}
