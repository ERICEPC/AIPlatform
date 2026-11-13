import { fireEvent, render, screen } from '@testing-library/react'
import AppIconPicker from '../index'

describe('Raccoon avatar picker', () => {
  it('requires a library selection and saves its stable identifier', () => {
    const onSelect = vi.fn()
    const onOpenChange = vi.fn()
    render(<AppIconPicker open onOpenChange={onOpenChange} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /iconPicker.ok/ })).toBeDisabled()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'reading' } })
    fireEvent.click(screen.getByRole('button', { name: 'reading' }))
    fireEvent.click(screen.getByRole('button', { name: /iconPicker.ok/ }))
    expect(onSelect).toHaveBeenCalledWith({
      type: 'emoji',
      icon: 'rx:reading',
      background: '#E9EDDF',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('button', { name: /iconPicker.image/ })).not.toBeInTheDocument()
  })
  it('restores the selected avatar and cancellation does not save a change', () => {
    const onSelect = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <AppIconPicker
        open
        onOpenChange={onOpenChange}
        onSelect={onSelect}
        initialEmoji={{ icon: 'rx:teamwork' }}
      />,
    )
    expect(screen.getByRole('button', { name: 'teamwork' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /iconPicker.cancel/ }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
