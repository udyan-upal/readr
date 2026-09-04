'use client'

import { useState } from 'react'
import { FaNotesMedical } from 'react-icons/fa'
import { FiEdit2, FiTrash2 } from 'react-icons/fi'
import type { PdfNote } from '@/types'

interface Props {
	notes: PdfNote[]
	currentPage: number
	onNavigate: (page: number, noteId: string) => void
	onEdit: (noteId: string, text: string) => Promise<void>
	onDelete: (noteId: string) => Promise<void>
}

export default function NotesPanel({ notes, currentPage, onNavigate, onEdit, onDelete }: Props) {
	const [editingId, setEditingId] = useState<string | null>(null)
	const [editText, setEditText] = useState('')
	const [saving, setSaving] = useState(false)

	const grouped = notes.reduce<Record<number, PdfNote[]>>((acc, n) => {
		;(acc[n.pageNumber] ??= []).push(n)
		return acc
	}, {})
	const pages = Object.keys(grouped)
		.map(Number)
		.sort((a, b) => a - b)

	const startEdit = (note: PdfNote, e: React.MouseEvent) => {
		e.stopPropagation()
		setEditingId(note.id)
		setEditText(note.noteText)
	}

	const cancelEdit = () => {
		setEditingId(null)
		setEditText('')
	}

	const saveEdit = async (noteId: string) => {
		if (!editText.trim()) return
		setSaving(true)
		try {
			await onEdit(noteId, editText.trim())
			setEditingId(null)
		} finally {
			setSaving(false)
		}
	}

	return (
		<aside className="notes-panel">
			<div className="notes-panel-header">
				<FaNotesMedical className="notes-panel-header-icon" />
				<span>Notes</span>
				{notes.length > 0 && <span className="notes-panel-badge">{notes.length}</span>}
			</div>

			{notes.length === 0 ? (
				<div className="notes-panel-empty">
					No notes yet. Click the{' '}
					<FaNotesMedical
						style={{ display: 'inline', verticalAlign: 'middle', color: 'var(--accent)' }}
					/>{' '}
					icon on any line to add a note.
				</div>
			) : (
				<div className="notes-panel-list">
					{pages.map((page) => (
						<div key={page} className="notes-page-group">
							<button
								className={`notes-page-label${page === currentPage ? ' current' : ''}`}
								onClick={() => onNavigate(page, grouped[page][0].id)}
							>
								Page {page}
							</button>
							{grouped[page].map((note) => (
								<div key={note.id} className="notes-item">
									{editingId === note.id ? (
										<div className="notes-item-edit">
											<textarea
												className="notes-item-textarea"
												value={editText}
												onChange={(e) => setEditText(e.target.value)}
												disabled={saving}
												autoFocus
												onKeyDown={(e) => {
													if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void saveEdit(note.id)
													if (e.key === 'Escape') cancelEdit()
												}}
											/>
											<div className="notes-item-edit-actions">
												<button
													className="notes-save-btn"
													onClick={() => void saveEdit(note.id)}
													disabled={saving || !editText.trim()}
												>
													Save
												</button>
												<button className="notes-cancel-btn" onClick={cancelEdit} disabled={saving}>
													Cancel
												</button>
											</div>
										</div>
									) : (
										<div
											className="notes-item-view"
											onClick={() => onNavigate(page, note.id)}
											role="button"
											tabIndex={0}
											onKeyDown={(e) => e.key === 'Enter' && onNavigate(page, note.id)}
										>
											<p className="notes-item-text">{note.noteText}</p>
											<div className="notes-item-actions">
												<button
													className="notes-action-btn"
													onClick={(e) => startEdit(note, e)}
													title="Edit"
												>
													<FiEdit2 size={13} />
												</button>
												<button
													className="notes-action-btn notes-action-delete"
													onClick={(e) => {
														e.stopPropagation()
														void onDelete(note.id)
													}}
													title="Delete"
												>
													<FiTrash2 size={13} />
												</button>
											</div>
										</div>
									)}
								</div>
							))}
						</div>
					))}
				</div>
			)}
		</aside>
	)
}
