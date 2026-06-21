import { useCallback, useEffect, useState } from 'react'
import type { GeneratorOptions } from '../types'
import { DEFAULT_GENERATOR } from '../constants'
import { generatePassword } from '../utils/generator'

/** Generator options + the current generated password, regenerated as options change. */
export function usePasswordGenerator(initial: GeneratorOptions = DEFAULT_GENERATOR) {
  const [options, setOptions] = useState<GeneratorOptions>(initial)
  const [password, setPassword] = useState(() => generatePassword(initial))

  // Re-roll whenever the options change.
  useEffect(() => {
    setPassword(generatePassword(options))
  }, [options])

  const regenerate = useCallback(() => setPassword(generatePassword(options)), [options])

  const updateOption = useCallback(
    <K extends keyof GeneratorOptions>(key: K, value: GeneratorOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  return { options, password, regenerate, updateOption }
}
