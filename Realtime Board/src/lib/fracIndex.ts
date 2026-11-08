/**
 * Fractional indexing — ordering a list so that concurrent inserts never collide.
 *
 * WHY THIS EXISTS
 * ---------------
 * The obvious way to order cards in a column is an integer `position`. It breaks the
 * moment two people drag at the same time: both compute `position = 3`, both write,
 * and one silently wins. Renumbering the whole column on every move is worse — it
 * turns one drag into N row updates, each of which is its own conflict.
 *
 * Fractional indexing gives every card an *order key* that is a string. To place a
 * card between two neighbours you generate a key that sorts strictly between theirs.
 * No other row is touched, so two people inserting in different places never conflict,
 * and two people inserting in the SAME place produce two different keys that both
 * survive — they just end up adjacent, in a stable order, rather than clobbering.
 *
 * Keys compare with plain lexicographic `<`, so the database can do the work:
 *   SELECT ... ORDER BY order_key
 * and Postgres's default collation on a `text` column matches JS string comparison
 * for the ASCII subset we use.
 *
 * WHY STRINGS AND NOT FLOATS
 * --------------------------
 * A float midpoint looks simpler: `(a + b) / 2`. But each midpoint burns a bit of
 * mantissa, and after ~50 inserts at the same spot a double runs out of precision and
 * silently returns a value equal to one of its neighbours. Strings can always grow one
 * more character, so the scheme never runs out — keys just get longer.
 *
 * KEY FORMAT
 * ----------
 * A key is an integer part followed by an optional fractional part.
 *
 * The integer part's first character encodes how long it is, which is what lets us
 * parse a key without a separator:
 *   'a'..'z' → positive, total length 2..27   ('a' = 2, so "a0" is the shortest)
 *   'A'..'Z' → negative, total length 2..27   ('Z' = 2, 'A' = 27)
 * The remaining characters are base-62 digits.
 *
 * The fractional part is bare base-62 digits with no trailing zero (a trailing zero
 * would be a second spelling of the same value, which would break the 1:1 mapping
 * between keys and positions).
 *
 * The algorithm is the one described in David Greenspan's "Implementing Fractional
 * Indexing" and used by Figma and Linear. This is an independent implementation of
 * that published approach.
 */

/** Base-62 digits, in ASCII order so that digit order == lexicographic order. */
export const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** The key handed out when a list is empty. Mid-range, so there is room on both sides. */
export const FIRST_KEY = 'a0'

/**
 * The widest negative integer part. Nothing can be ordered before it, so `keyBetween`
 * burrows into the fractional part instead of trying to decrement past it. The
 * positive end needs no constant: `incrementInteger` returns null when it overflows.
 */
const SMALLEST_INTEGER = 'A00000000000000000000000000'

export class OrderKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrderKeyError'
  }
}

/**
 * How many characters the integer part occupies, read from its first character.
 * This is the trick that makes a key self-delimiting.
 */
function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 97 + 2
  if (head >= 'A' && head <= 'Z') return 90 - head.charCodeAt(0) + 2
  throw new OrderKeyError(`invalid order key head: ${JSON.stringify(head)}`)
}

/** Split the integer part off the front of a key. */
function integerPart(key: string): string {
  const len = integerLength(key.charAt(0))
  if (len > key.length) throw new OrderKeyError(`order key too short: ${JSON.stringify(key)}`)
  return key.slice(0, len)
}

/**
 * Throw unless `key` is well formed. Called on every input so a corrupt key from the
 * network fails loudly here rather than quietly producing a bad ordering later.
 */
export function validateKey(key: string, digits: string = BASE62): void {
  if (key === '') throw new OrderKeyError('order key is empty')
  if (key === SMALLEST_INTEGER) throw new OrderKeyError('order key is the reserved minimum')
  const int = integerPart(key)
  for (const ch of int.slice(1)) {
    if (!digits.includes(ch)) throw new OrderKeyError(`invalid digit in integer part: ${ch}`)
  }
  const frac = key.slice(int.length)
  for (const ch of frac) {
    if (!digits.includes(ch)) throw new OrderKeyError(`invalid digit in fractional part: ${ch}`)
  }
  if (frac.endsWith(digits.charAt(0))) {
    throw new OrderKeyError(`order key has a trailing zero: ${JSON.stringify(key)}`)
  }
}

export function isValidKey(key: string, digits: string = BASE62): boolean {
  try {
    validateKey(key, digits)
    return true
  } catch {
    return false
  }
}

/** Increment a fixed-width base-N integer part, or null if it would overflow its width. */
function incrementInteger(int: string, digits: string): string | null {
  const head = int.charAt(0)
  const body = int.slice(1).split('')
  let carry = true
  for (let i = body.length - 1; carry && i >= 0; i--) {
    const next = digits.indexOf(body[i]!) + 1
    if (next === digits.length) {
      body[i] = digits.charAt(0)
    } else {
      body[i] = digits.charAt(next)
      carry = false
    }
  }
  if (carry) {
    // The body wrapped, so the integer part has to get one character wider — which
    // means moving to the next head character.
    if (head === 'Z') return 'a' + digits.charAt(0)
    if (head === 'z') return null
    const nextHead = String.fromCharCode(head.charCodeAt(0) + 1)
    const width = nextHead > 'a' ? 1 : -1
    return nextHead + (width > 0 ? body.join('') + digits.charAt(0) : body.slice(1).join(''))
  }
  return head + body.join('')
}

/** Decrement a fixed-width base-N integer part, or null if it would underflow. */
function decrementInteger(int: string, digits: string): string | null {
  const head = int.charAt(0)
  const body = int.slice(1).split('')
  let borrow = true
  for (let i = body.length - 1; borrow && i >= 0; i--) {
    const next = digits.indexOf(body[i]!) - 1
    if (next === -1) {
      body[i] = digits.slice(-1)
    } else {
      body[i] = digits.charAt(next)
      borrow = false
    }
  }
  if (borrow) {
    if (head === 'a') return 'Z' + digits.slice(-1)
    if (head === 'A') return null
    const nextHead = String.fromCharCode(head.charCodeAt(0) - 1)
    const width = nextHead < 'Z' ? 1 : -1
    return nextHead + (width > 0 ? digits.slice(-1) + body.join('') : body.slice(1).join(''))
  }
  return head + body.join('')
}

/**
 * A fractional-digit string strictly between `a` and `b`, where both are bare
 * fractional parts (no integer part) and `b === null` means "+infinity".
 *
 * This is where the keys actually grow: when the neighbours are adjacent digits there
 * is no digit between them, so we descend a place and recurse.
 */
function midpoint(a: string, b: string | null, digits: string): string {
  const zero = digits.charAt(0)
  if (b !== null && a >= b) throw new OrderKeyError(`${a} >= ${b}`)
  if (a.endsWith(zero) || (b !== null && b.endsWith(zero))) {
    throw new OrderKeyError('trailing zero in fractional part')
  }

  if (b !== null) {
    // Walk past the shared prefix; only the first differing place matters.
    let shared = 0
    while ((a.charAt(shared) || zero) === b.charAt(shared)) shared++
    if (shared > 0) {
      return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared), digits)
    }
  }

  const digitA = a === '' ? 0 : digits.indexOf(a.charAt(0))
  const digitB = b !== null ? digits.indexOf(b.charAt(0)) : digits.length

  if (digitB - digitA > 1) {
    // There is room: take the digit halfway between them and stop.
    return digits.charAt(Math.round(0.5 * (digitA + digitB)))
  }

  // The digits are adjacent, so nothing fits at this place. Keep b's digit if b has
  // more to give, otherwise keep a's digit and find room one place deeper.
  if (b !== null && b.length > 1) return b.slice(0, 1)
  return digits.charAt(digitA) + midpoint(a.slice(1), null, digits)
}

/**
 * An order key that sorts strictly between `a` and `b`.
 *
 * `a === null` means "before everything" and `b === null` means "after everything",
 * so the four cases are: first key in an empty list, prepend, append, and insert
 * between two cards.
 *
 * @throws OrderKeyError if either key is malformed or `a >= b`.
 */
export function keyBetween(
  a: string | null,
  b: string | null,
  digits: string = BASE62,
): string {
  if (a !== null) validateKey(a, digits)
  if (b !== null) validateKey(b, digits)
  if (a !== null && b !== null && a >= b) {
    throw new OrderKeyError(`keys out of order: ${a} >= ${b}`)
  }

  if (a === null) {
    if (b === null) return FIRST_KEY
    // Prepend: step the integer part down if we can, otherwise burrow into the fraction.
    const intB = integerPart(b)
    const fracB = b.slice(intB.length)
    if (intB === SMALLEST_INTEGER) return intB + midpoint('', fracB, digits)
    if (intB < b) return intB
    const decremented = decrementInteger(intB, digits)
    if (decremented === null) throw new OrderKeyError('cannot order before the minimum key')
    return decremented
  }

  if (b === null) {
    // Append: step the integer part up if we can, otherwise extend the fraction.
    const intA = integerPart(a)
    const fracA = a.slice(intA.length)
    const incremented = incrementInteger(intA, digits)
    return incremented === null ? intA + midpoint(fracA, null, digits) : incremented
  }

  const intA = integerPart(a)
  const fracA = a.slice(intA.length)
  const intB = integerPart(b)
  const fracB = b.slice(intB.length)
  if (intA === intB) return intA + midpoint(fracA, fracB, digits)

  const incremented = incrementInteger(intA, digits)
  if (incremented === null) throw new OrderKeyError('cannot order after the maximum key')
  if (incremented < b) return incremented
  return intA + midpoint(fracA, null, digits)
}

/**
 * `count` keys in ascending order, all strictly between `a` and `b`.
 * Used when seeding a column or pasting several cards at once.
 */
export function keysBetween(
  a: string | null,
  b: string | null,
  count: number,
  digits: string = BASE62,
): string[] {
  if (count <= 0) return []
  if (count === 1) return [keyBetween(a, b, digits)]

  if (b === null) {
    let cursor = keyBetween(a, b, digits)
    const out = [cursor]
    for (let i = 1; i < count; i++) {
      cursor = keyBetween(cursor, b, digits)
      out.push(cursor)
    }
    return out
  }

  if (a === null) {
    let cursor = keyBetween(a, b, digits)
    const out = [cursor]
    for (let i = 1; i < count; i++) {
      cursor = keyBetween(a, cursor, digits)
      out.push(cursor)
    }
    return out.reverse()
  }

  // Split the range in half and recurse, so keys stay short instead of all piling up
  // against one end.
  const mid = Math.floor(count / 2)
  const midKey = keyBetween(a, b, digits)
  return [
    ...keysBetween(a, midKey, mid, digits),
    midKey,
    ...keysBetween(midKey, b, count - mid - 1, digits),
  ]
}

/**
 * The key for dropping a card at `index` in a list already sorted by order key.
 * `index` is the slot the card should occupy afterwards, so 0 prepends and
 * `keys.length` appends.
 *
 * Callers pass the list WITHOUT the card being moved, which is what makes a move and
 * an insert the same operation.
 */
export function keyForIndex(keys: readonly string[], index: number, digits: string = BASE62): string {
  const clamped = Math.max(0, Math.min(index, keys.length))
  const before = clamped === 0 ? null : (keys[clamped - 1] ?? null)
  const after = clamped >= keys.length ? null : (keys[clamped] ?? null)
  return keyBetween(before, after, digits)
}

/**
 * How many characters the longest key is using. Keys grow about one character per
 * repeated insert into the same gap; the UI uses this to decide when a column is worth
 * rebalancing. Rebalancing is a rewrite of every row in the column, so it should be
 * rare and deliberate rather than automatic.
 */
export function maxKeyLength(keys: readonly string[]): number {
  return keys.reduce((longest, key) => Math.max(longest, key.length), 0)
}

/** Evenly spaced keys for `count` items — what a rebalance assigns. */
export function rebalance(count: number, digits: string = BASE62): string[] {
  return keysBetween(null, null, count, digits)
}
