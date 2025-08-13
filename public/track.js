/**
 * This script manages the entire functionality for the Approval Records table,
 * including fetching data, populating the table, searching, filtering,
 * deleting records (single and bulk), and the updated click-to-edit feature.
 */

// Global variables to manage state
let pendingBulkDeletionIds = [];
let bulkUndoTimeout = null;
let allData = []; // Store all fetched data globally
let lastDeletedRecord = null;
let undoTimeout = null;

// Main setup after the page is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch of data to populate the table
    fetchDataAndUpdateTable();

    // Listener for the main search input field
    document.getElementById('search-input').addEventListener('input', function() {
        const query = this.value.trim().toLowerCase();
        const filtered = allData.filter(record => {
            const today = new Date();
            const currentDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
            const validTillDate = record.validTill ? new Date(record.validTill) : null;
            let status = 'Not Valid';
            if (validTillDate) {
                const validTillUTC = new Date(Date.UTC(
                    validTillDate.getUTCFullYear(),
                    validTillDate.getUTCMonth(),
                    validTillDate.getUTCDate()
                ));
                if (currentDate <= validTillUTC) {
                    status = 'Valid';
                }
            }
            const emailSentStatus = record.reminderSent ? 'yes' : 'no';

            const recordValues = Object.values(record).join(' ').toLowerCase();
            const emailValues = (record.emails || []).join(' ').toLowerCase();

            return (
                recordValues.includes(query) ||
                emailValues.includes(query) ||
                status.toLowerCase().includes(query) ||
                emailSentStatus.toLowerCase().includes(query)
            );
        });
        populateTable(filtered);
    });

    // Listener for the "Delete All Displayed" button
    document.getElementById('deleteAllBtn').addEventListener('click', () => {
        const visibleRows = Array.from(document.querySelectorAll('#approval-table tbody tr'))
            .filter(row => row.style.display !== 'none');
        const visibleIds = visibleRows.map(row => row.dataset.id);

        if (visibleIds.length === 0) {
            alert('No visible records to delete');
            return;
        }
        pendingBulkDeletionIds = visibleIds;
        const deletedRecords = allData.filter(record => visibleIds.includes(record._id));
        allData = allData.filter(record => !visibleIds.includes(record._id));
        populateTable(allData);
        showUndoSnackbar(`${deletedRecords.length} records deleted.`, () => {
            clearTimeout(bulkUndoTimeout);
            pendingBulkDeletionIds = [];
            allData = [...allData, ...deletedRecords].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            populateTable(allData);
        });
        bulkUndoTimeout = setTimeout(() => {
            if (pendingBulkDeletionIds.length > 0) {
                finalizeBulkDelete(pendingBulkDeletionIds);
            }
        }, 5000);
    });

    // Event delegation for delete and edit
    document.getElementById('approval-table').addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-btn')) {
            const id = e.target.getAttribute('data-id');
            if (confirm('Are you sure you want to delete this record?')) {
                softDeleteRecord(id);
            }
            return;
        }

        const cell = e.target.closest('.editable-cell');
        if (!cell || cell.querySelector('.edit-in-place')) return;

        const originalText = cell.textContent.trim();
        const field = cell.dataset.field;
        const row = cell.closest('tr');
        const id = row.dataset.id;

        if (!id || !field) return;

        cell.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-in-place';
        input.value = originalText;
        cell.appendChild(input);
        input.focus();
        input.select();

        const saveChanges = () => {
            const newValue = input.value.trim();
            cell.textContent = newValue;

            fetch('/api/update-cell', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id, field, value: newValue })
            }).then(res => {
                if (!res.ok) {
                    console.error("Failed to save changes.");
                    cell.textContent = originalText;
                }
            }).catch(err => {
                console.error("Error saving changes:", err);
                cell.textContent = originalText;
            });
        };

        input.addEventListener('blur', saveChanges);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') input.blur();
            else if (event.key === 'Escape') {
                input.removeEventListener('blur', saveChanges);
                cell.textContent = originalText;
            }
        });
    });

    // Global click listener to close filter dropdowns
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-dropdown')) {
            document.querySelectorAll('.filter-dropdown').forEach(d => d.remove());
        }
    });
});

// REVERTED FUNCTION: Opens the Google Form in a new tab
function openGoogleForm(approvalId) {
  if (confirm("Are you sure you want to stop all future emails for this record?")) {
    let formBaseUrl = "https://docs.google.com/forms/d/e/1FAIpQLSdtmQmzRqdGq9YmJYObfHWuyEhIcdxL7dq6TqlC3Zf4lsDTSg/viewform";
    var approvalIdEntry = "entry.201971047";
    var prefilledUrl = `${formBaseUrl}?usp=pp_url&${approvalIdEntry}=${encodeURIComponent(approvalId)}`;
    window.open(prefilledUrl, '_blank');
  }
}

function getColumnNames(data) {
  const exclude = new Set([
    '_id', 'createdAt', 'updatedAt', 'reminderSent', '__v', 'lastEmailSentAt',
    'stopEmails', 'userId', 'status', 'notifiedDays', 'emails', 'uploadedFormDocs'
  ]);
  const columns = new Set();
  data.forEach(item => {
    Object.keys(item).forEach(key => {
      if (!exclude.has(key)) {
        columns.add(key);
      }
    });
  });
  return Array.from(columns);
}

function populateTable(data) {
  const columns = getColumnNames(data);
  const emailColumnNames = ['Performer Email', 'Unit Head Email', 'Unit Chief Email', 'Head Environment Email', 'Compliance Email'];
  const thead = document.querySelector('#approval-table thead');
  
  // ADDED 'DOCUMENTS' HEADER
  thead.innerHTML = '<tr>' +
    columns.map(col => 
      `<th>
        ${col.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}
        <button class="delete-col-btn" data-field="${col}" title="Delete column" style="margin-left:6px;color:#e53935; border:none; background:transparent; cursor:pointer;">&#128465;</button>
      </th>`
    ).join('') +
    emailColumnNames.map(col => `<th>${col.toUpperCase()}</th>`).join('') +
    '<th>Status</th><th>Last Email Sent</th><th>Delete</th><th>Active</th><th>Documents</th></tr>';

  thead.querySelectorAll('.delete-col-btn').forEach(btn => {
      btn.onclick = function(e) {
        e.stopPropagation();
        const field = this.getAttribute('data-field');
        if (confirm(`Are you sure you want to delete the column "${field}"? This will remove the field from all records.`)) {
          fetch('/api/delete-column', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field })
          })
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              fetchDataAndUpdateTable();
            } else {
              alert('Failed to delete column: ' + (result.message || 'Unknown error'));
            }
          });
        }
      };
  });

  const tbody = document.querySelector('#approval-table tbody');
  tbody.innerHTML = '';
  if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="99">No records found.</td></tr>`;
    return;
  }

  data.forEach(record => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', record._id);

    let rowHTML = columns.map(col => {
      let value = record[col];
      if (Array.isArray(value)) value = value.join(', ');
      if (['grantedOn', 'validTill', 'lastEmailSentAt'].includes(col)) {
        value = value ? new Date(value).toLocaleDateString() : '';
      }
      return `<td class="editable-cell" data-field="${col}">${value !== undefined ? value : ''}</td>`;
    }).join('');

    const recordEmails = record.emails || [];
    for (let i = 0; i < 5; i++) {
        const email = recordEmails[i] || '';
        rowHTML += `<td class="editable-cell" data-field="emails.${i}">${email}</td>`;
    }
    
    const validTillDate = record.validTill ? new Date(record.validTill) : null;
    let status = 'Not Valid';
    let statusClass = 'status-not-valid';
    if (validTillDate && new Date() <= validTillDate) {
      status = 'Valid';
      statusClass = 'status-valid';
    }

    // NEW LOGIC: Generate links for uploaded documents
    let documentsHTML = 'No documents';
    if (record.uploadedFormDocs && record.uploadedFormDocs.length > 0) {
        documentsHTML = record.uploadedFormDocs.map((doc, index) => {
            return `<a href="${doc.fileUrl}" target="_blank" rel="noopener noreferrer" style="color: #8ab4f8;">View Doc ${index + 1}</a>`;
        }).join('<br>'); // Separate multiple links with a line break
    }

    // ADDED a new <td> for documents at the end
    const actionCells = `
      <td class="${statusClass}">${status}</td>
      <td>${record.lastEmailSentAt ? new Date(record.lastEmailSentAt).toLocaleDateString() : 'Not sent yet'}</td>
      <td><button class="delete-btn" data-id="${record._id}" style="color:#fff; background:#e53935; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Delete</button></td>
      <td>
        <button
          class="stop-email-btn"
          data-id="${record._id}"
          style="color:#fff; background:#ff9800; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;"
          ${record.stopEmails ? 'disabled' : ''}
          onclick="openGoogleForm('${record._id}')"
        >
          ${record.stopEmails ? 'Stopped' : 'Active'}
        </button>
      </td>
      <td>${documentsHTML}</td>
    `;
    tr.innerHTML = rowHTML + actionCells;
    tbody.appendChild(tr);
  });
}

function addHeaderFilterListeners() {
  const headers = document.querySelectorAll('#approval-table thead th');
  headers.forEach((header, index) => {
    const totalColumns = headers.length;
    if (index >= totalColumns - 4) return;

    header.style.cursor = 'pointer';
    header.addEventListener('click', (event) => {
      if (event.target.classList.contains('delete-col-btn') || event.target.isContentEditable) return;
      
      document.querySelectorAll('.filter-dropdown').forEach(el => el.remove());
      
      const rows = document.querySelectorAll('#approval-table tbody tr');
      const uniqueValues = new Set();
      rows.forEach(row => {
        const cell = row.querySelector(`td:nth-child(${index + 1})`);
        if (cell) uniqueValues.add(cell.textContent.trim());
      });

      const dropdown = document.createElement('div');
      dropdown.classList.add('filter-dropdown');
      Object.assign(dropdown.style, {
          position: 'absolute', background: '#fff', border: '1px solid #ccc',
          zIndex: 1000, maxHeight: '200px', overflowY: 'auto', minWidth: '160px', color: '#333'
      });
      
      const rect = header.getBoundingClientRect();
      Object.assign(dropdown.style, { left: `${rect.left}px`, top: `${rect.bottom}px` });

      const showAllOption = document.createElement('div');
      showAllOption.textContent = 'Show All';
      Object.assign(showAllOption.style, { padding: '8px', cursor: 'pointer', borderBottom: '1px solid #eee' });
      showAllOption.onclick = () => {
        filterTableByColumn(index, null);
        dropdown.remove();
      };
      dropdown.appendChild(showAllOption);

      uniqueValues.forEach(value => {
        const option = document.createElement('div');
        option.textContent = value;
        Object.assign(option.style, { padding: '8px', cursor: 'pointer', borderBottom: '1px solid #eee' });
        option.onclick = () => {
          filterTableByColumn(index, value);
          dropdown.remove();
        };
        dropdown.appendChild(option);
      });

      document.body.appendChild(dropdown);
      event.stopPropagation();
    });
  });
}

function filterTableByColumn(columnIndex, filterValue) {
  const rows = document.querySelectorAll('#approval-table tbody tr');
  rows.forEach(row => {
    const cell = row.querySelector(`td:nth-child(${columnIndex + 1})`);
    if (!filterValue || (cell && cell.textContent.trim() === filterValue)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function finalizeBulkDelete(ids) {
    fetch('/api/approvals/delete-many', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
    })
    .then(res => res.json())
    .then(result => {
        if (!result.success) console.error('Bulk delete failed:', result.message);
    })
    .catch(error => console.error('Bulk delete error:', error));
}

async function fetchDataAndUpdateTable() {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    allData = data;
    populateTable(allData);
    addHeaderFilterListeners();
  } catch (error) {
    console.error('Failed to fetch data:', error);
  }
}

function showUndoSnackbar(message, undoCallback) {
    const snackbar = document.getElementById('undo-snackbar');
    const messageSpan = document.getElementById('undo-message');
    const undoBtn = document.getElementById('undo-btn');

    messageSpan.textContent = message;
    snackbar.style.visibility = 'visible';

    const newUndoBtn = undoBtn.cloneNode(true);
    undoBtn.parentNode.replaceChild(newUndoBtn, undoBtn);

    newUndoBtn.addEventListener('click', () => {
        if (undoTimeout) clearTimeout(undoTimeout);
        snackbar.style.visibility = 'hidden';
        if (undoCallback) undoCallback();
    });

    undoTimeout = setTimeout(() => {
        snackbar.style.visibility = 'hidden';
        if (lastDeletedRecord) finalizeDelete(lastDeletedRecord._id);
        lastDeletedRecord = null;
    }, 5000);
}

function softDeleteRecord(id) {
    const idx = allData.findIndex(item => item._id === id);
    if (idx !== -1) {
        lastDeletedRecord = allData[idx];
        allData.splice(idx, 1);
        populateTable(allData);
        showUndoSnackbar("Record deleted.", () => {
            allData.splice(idx, 0, lastDeletedRecord);
            populateTable(allData);
            lastDeletedRecord = null;
        });
    }
}

function finalizeDelete(id) {
  fetch(`/api/approvals/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(res => res.json())
  .then(result => {
    if (!result.success) {
      alert('Failed to delete record: ' + (result.message || 'Unknown error'));
      if (lastDeletedRecord) {
        allData.push(lastDeletedRecord);
        populateTable(allData);
      }
    }
    lastDeletedRecord = null;
  })
  .catch(error => {
    alert('Network error during deletion');
    if (lastDeletedRecord) {
      allData.push(lastDeletedRecord);
      populateTable(allData);
    }
    lastDeletedRecord = null;
  });
}
