import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

type Item = {
  id: string
  sku: string
  name: string
  unit: string
  createdAt: string
}

function CatalogRow({
  item,
  onChanged,
  onError,
}: {
  item: Item
  onChanged: () => Promise<void>
  onError: (message: string) => void
}) {
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState(item.unit)

  useEffect(() => {
    setName(item.name)
    setUnit(item.unit)
  }, [item.name, item.unit])

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onError('')
    const response = await fetch(`/api/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, unit }),
    })
    if (response.ok) {
      await onChanged()
      return
    }
    const body = (await response.json()) as { error?: string }
    onError(body.error ?? 'Não foi possível atualizar o item')
  }

  async function onDelete() {
    onError('')
    const response = await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
    if (response.status === 204) {
      await onChanged()
    }
  }

  return (
    <li>
      <form onSubmit={(event) => void onSave(event)}>
        <span>{item.sku}</span>
        <label>
          Nome
          <input
            name="edit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label>
          Unidade
          <input
            name="edit-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            required
          />
        </label>
        <button type="submit">Salvar</button>
      </form>
      <button type="button" onClick={() => void onDelete()}>
        Excluir
      </button>
    </li>
  )
}

function App() {
  const [items, setItems] = useState<Item[]>([])
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    const response = await fetch('/api/items')
    if (!response.ok) return
    const data = (await response.json()) as Item[]
    setItems(data)
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const response = await fetch('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sku, name, unit }),
    })
    if (response.status === 201) {
      setSku('')
      setName('')
      setUnit('')
      await refresh()
      return
    }
    const body = (await response.json()) as { error?: string }
    setError(body.error ?? 'Não foi possível criar o item')
  }

  return (
    <main>
      <h1>Catálogo</h1>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          SKU
          <input
            name="sku"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
          />
        </label>
        <label>
          Nome
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label>
          Unidade
          <input
            name="unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            required
          />
        </label>
        <button type="submit">Criar item</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {items.length === 0 ? (
        <p>Nenhum item no catálogo.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <CatalogRow
              key={item.id}
              item={item}
              onChanged={refresh}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
