let pendingBulkDeletionIds = [];
let bulkUndoTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    const headers = document.querySelectorAll('#approval-table th');
    
    headers.forEach((header, index) => {
        // Create filter container
        const filterDiv = document.createElement('div');
        filterDiv.className = 'filter-dropdown';
        header.appendChild(filterDiv);
        
        // Add click handler
        header.addEventListener('click', (e) => {
            if (index >= 14) return; // Skip action columns
            
            // Remove existing dropdowns
            document.querySelectorAll('.filter-options').forEach(d => d.remove());
            
            // Get unique values
            const values = Array.from(document.querySelectorAll(`#approval-table td:nth-child(${index+1})`))
                .map(td => td.textContent.trim())
                .filter((value, i, self) => value && self.indexOf(value) === i);

            // Create dropdown
            const options = document.createElement('div');
            options.className = 'filter-options';
            
            // Add "Show All" option
            const showAll = document.createElement('div');
            showAll.className = 'filter-option';
            showAll.textContent = 'Show All';
            showAll.onclick = () => filterTable('');
            options.appendChild(showAll);

            // Add unique values
            values.forEach(value => {
                const option = document.createElement('div');
                option.className = 'filter-option';
                option.textContent = value;
                option.onclick = () => filterTable(value, index+1);
                options.appendChild(option);
            });

            filterDiv.appendChild(options);
            options.classList.toggle('show');
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-dropdown')) {
            document.querySelectorAll('.filter-options').forEach(d => d.remove());
        }
    });
});

function filterTable(value, columnIndex) {
    const rows = document.querySelectorAll('#approval-table tbody tr');
    
    rows.forEach(row => {
        const cell = row.querySelector(`td:nth-child(${columnIndex})`);
        if (!columnIndex || cell.textContent.trim() === value || value === '') {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}


let allData = []; // Store all fetched data globally

document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/data')
        .then(res => res.json())
        .then(data => {
            allData = data;
            populateTable(allData);
            addHeaderFilterListeners();
        })
        .catch(err => {
            document.querySelector('#approval-table tbody').innerHTML =
                `<tr><td colspan="15">Error loading data</td></tr>`;
        });

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

        return (
            Object.values(record).some(val =>
                String(val).toLowerCase().includes(query)
            ) ||
            status.toLowerCase() === query ||      // Exact match for status
            emailSentStatus === query              // Exact match for email sent
        );
    });
    populateTable(filtered);
});



});

function populateTable(data) {
    // Custom sort: Valid first, then Not Valid, each by nearest validTill date
    const today = new Date();
    const sortedData = [...data].sort((a, b) => {
        // Parse validTill dates
        const aValidTill = a.validTill ? new Date(a.validTill) : null;
        const bValidTill = b.validTill ? new Date(b.validTill) : null;

        // Determine validity
        const aIsValid = aValidTill && today <= aValidTill;
        const bIsValid = bValidTill && today <= bValidTill;

        // Sort by validity: Valid first
        if (aIsValid !== bIsValid) {
            return bIsValid - aIsValid; // true > false
        }

        // Both are valid or both are not valid
        // Sort by validTill date nearest to today (ascending)
        if (aValidTill && bValidTill) {
            // For valid: nearest future date; for not valid: most recently expired
            const aDiff = Math.abs(aValidTill - today);
            const bDiff = Math.abs(bValidTill - today);
            return aDiff - bDiff;
        } else if (aValidTill) {
            return -1;
        } else if (bValidTill) {
            return 1;
        } else {
            return 0;
        }
    });
    const tbody = document.querySelector('#approval-table tbody');
    tbody.innerHTML = '';
    if (!Array.isArray(data) || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15">No records found.</td></tr>`;
        return;
    }

    sortedData.forEach(record => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', record._id); // <-- Add this line
        const currentDate = new Date();
        const validTillDate = record.validTill ? new Date(record.validTill) : null;
        // Status calculation
        let status = 'Not Valid';
        let statusClass = 'status-not-valid';
        if (validTillDate && currentDate <= validTillDate) {
            status = 'Valid';
            statusClass = 'status-valid';
        }

        tr.innerHTML = `
            <td>${record.state || ''}</td>
            <td>${record.location || ''}</td>
            <td>${record.plant || ''}</td>
            <td>${record.site || ''}</td>
            <td>${record.facility || ''}</td>
            <td>${record.typeOfApproval || ''}</td>
            <td class="${
  record.category
    ? 'category-' + record.category.toLowerCase()
    : ''
}">${record.category || ''}</td>

            <td>${record.approvalNo || ''}</td>
            <td>${record.grantedOn ? new Date(record.grantedOn).toLocaleDateString() : ''}</td>
            <td>${validTillDate ? validTillDate.toLocaleDateString() : ''}</td>
            <td>${record.emails ? record.emails.join(', ') : ''}</td>
            <td class="${statusClass}">${status}</td>
            <td>${
  record.lastEmailSentAt
    ? new Date(record.lastEmailSentAt).toLocaleDateString()
    : 'Not sent yet'
}</td>
            <td><button class="delete-btn" data-id="${record._id}" style="color:#fff; background:#e53935; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Delete</button></td>
            <td>
        <button 
            class="stop-email-btn" 
            data-id="${record._id}" 
            ${record.stopEmails ? 'disabled' : ''}
            style="color:#fff; background:#ff9800; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">
            ${record.stopEmails ? 'Stopped' : 'Active'}
        </button>
    </td>
    
        `;
        tbody.appendChild(tr);
    });


    // Add this after the delete button event listeners
document.querySelectorAll('.stop-email-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        if (confirm('Are you sure you want to stop all future emails for this record?')) {
            fetch(`/api/stop-emails/${id}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        this.textContent = 'Stopped';
                        this.disabled = true;
                        // Optionally update local data
                        const record = allData.find(item => item._id === id);
                        if (record) record.stopEmails = true;
                    } else {
                        alert('Failed to stop emails.');
                    }
                });
        }
    });
});


}


// Add to your row creation function
function createTableRow(approval) {
  const row = document.createElement('tr');
  row.dataset.id = approval._id;
  
  // ... your existing row creation code ...
  
  // Add delete button to each row
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.classList.add('delete-btn');
  deleteBtn.onclick = () => deleteRecord(approval._id);
  
  // Add this button to your action cell
  actionCell.appendChild(deleteBtn);
  
  return row;
}



function addHeaderFilterListeners() {
  const headers = document.querySelectorAll('#approval-table thead th');

  headers.forEach((header, index) => {
    // Don't add filter to Delete or Stop Sending Mail columns
    if (index >= 15) return;

    header.style.cursor = 'pointer';
    header.addEventListener('click', (event) => {
      // Prevent multiple dropdowns
      document.querySelectorAll('.filter-dropdown').forEach(el => el.remove());

      // Collect unique values from the column
      const rows = document.querySelectorAll('#approval-table tbody tr');
      const uniqueValues = new Set();
      rows.forEach(row => {
        const cell = row.querySelector(`td:nth-child(${index + 1})`);
        if (cell) uniqueValues.add(cell.textContent.trim());
      });

      // Create dropdown container
      const dropdown = document.createElement('div');
      dropdown.classList.add('filter-dropdown');
      dropdown.style.position = 'fixed';
      dropdown.style.background = '#fff';
      dropdown.style.border = '1px solid #ccc';
      dropdown.style.zIndex = 1000;
      dropdown.style.maxHeight = '200px';
      dropdown.style.overflowY = 'auto';
      dropdown.style.minWidth = '120px';

      // Position dropdown below header
      const rect = header.getBoundingClientRect();
      dropdown.style.left = `${rect.left}px`;
      dropdown.style.top = `${rect.bottom}px`;

      // Add 'Show All' option
      const showAllOption = document.createElement('div');
      showAllOption.textContent = 'Show All';
      showAllOption.style.padding = '8px';
      showAllOption.style.cursor = 'pointer';
      showAllOption.style.borderBottom = '1px solid #eee';
      showAllOption.addEventListener('click', () => {
        filterTableByColumn(index, null);
        dropdown.remove();
      });
      dropdown.appendChild(showAllOption);

      // Add unique values as options
      uniqueValues.forEach(value => {
        const option = document.createElement('div');
        option.textContent = value;
        option.style.padding = '8px';
        option.style.cursor = 'pointer';
        option.style.borderBottom = '1px solid #eee';
        option.addEventListener('click', () => {
          filterTableByColumn(index, value);
          dropdown.remove();
        });
        dropdown.appendChild(option);
      });

      document.body.appendChild(dropdown);

      // Close dropdown if clicking outside
      const closeDropdown = (e) => {
        if (!dropdown.contains(e.target) && e.target !== header) {
          dropdown.remove();
          document.removeEventListener('click', closeDropdown);
        }
      };
      setTimeout(() => document.addEventListener('click', closeDropdown), 0);
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




// Update the delete button handler
document.getElementById('deleteAllBtn').addEventListener('click', () => {
  // Get visible IDs
  const visibleRows = Array.from(document.querySelectorAll('#approval-table tbody tr'))
    .filter(row => row.style.display !== 'none');
  
  const visibleIds = visibleRows.map(row => row.dataset.id);

  if (visibleIds.length === 0) {
    alert('No visible records to delete');
    return;
  }

  // Store IDs for possible deletion
  pendingBulkDeletionIds = visibleIds;
  
  // Remove from UI immediately
  const deletedRecords = allData.filter(record => visibleIds.includes(record._id));
  allData = allData.filter(record => !visibleIds.includes(record._id));
  populateTable(allData);
  
  // Show undo snackbar
  const snackbar = document.getElementById('undo-snackbar');
  const messageSpan = document.getElementById('undo-message');
  const undoBtn = document.getElementById('undo-btn');
  
  messageSpan.textContent = `${deletedRecords.length} records deleted. Click undo to revert.`;
  snackbar.style.visibility = 'visible';

  // Clear previous listeners
  const newUndoBtn = undoBtn.cloneNode(true);
  undoBtn.parentNode.replaceChild(newUndoBtn, undoBtn);

  newUndoBtn.addEventListener('click', () => {
    // Cancel pending deletion
    clearTimeout(bulkUndoTimeout);
    pendingBulkDeletionIds = [];
    snackbar.style.visibility = 'hidden';
    
    // Restore records
    allData = [...allData, ...deletedRecords];
    populateTable(allData);
  });
  
  // Schedule actual deletion after 5 seconds
  bulkUndoTimeout = setTimeout(() => {
    snackbar.style.visibility = 'hidden';
    if (pendingBulkDeletionIds.length > 0) {
      finalizeBulkDelete(pendingBulkDeletionIds);
    }
  }, 5000);
});


// Add this function for final bulk deletion
function finalizeBulkDelete(ids) {
    fetch('/api/approvals/delete-many', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
    })
    .then(res => res.json())
    .then(result => {
        if (!result.success) {
            console.error('Bulk delete failed:', result.message);
            // Restore records on failure
            allData = [...allData, ...lastBulkDeletedRecords];
            populateTable(allData);
        }
        lastBulkDeletedRecords = [];
    })
    .catch(error => {
        console.error('Bulk delete error:', error);
        allData = [...allData, ...lastBulkDeletedRecords];
        populateTable(allData);
        lastBulkDeletedRecords = [];
    });
}


function finalizeDelete(id) {
  fetch(`/api/approvals/${id}`, {  // Correct endpoint
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(res => res.json())
  .then(result => {
    if (!result.success) {
      alert('Failed to delete record: ' + (result.message || 'Unknown error'));
      // Restore to UI
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




async function fetchDataAndUpdateTable() {
  try {
    const response = await fetch('/api/data'); // Your data endpoint
    const data = await response.json();
    allData = data;
    populateTable(allData);
  } catch (error) {
    console.error('Failed to fetch data:', error);
  }
}



// --- Undo Delete Feature ---

let lastDeletedRecord = null;
let undoTimeout = null;

// Show snackbar
function showUndoSnackbar(message, undoCallback) {
    const snackbar = document.getElementById('undo-snackbar');
    const messageSpan = document.getElementById('undo-message');
    const undoBtn = document.getElementById('undo-btn');

    messageSpan.textContent = message;
    snackbar.style.visibility = 'visible';

    // Remove previous listeners
    const newUndoBtn = undoBtn.cloneNode(true);
    undoBtn.parentNode.replaceChild(newUndoBtn, undoBtn);

    newUndoBtn.addEventListener('click', () => {
        if (undoTimeout) clearTimeout(undoTimeout);
        snackbar.style.visibility = 'hidden';
        if (undoCallback) undoCallback();
    });

    // Hide after 5 seconds
    undoTimeout = setTimeout(() => {
        snackbar.style.visibility = 'hidden';
        // If not undone, finalize deletion
        if (lastDeletedRecord) finalizeDelete(lastDeletedRecord._id);
        lastDeletedRecord = null;
    }, 5000);
}

// Soft delete: Remove from table, but not from server yet
function softDeleteRecord(id) {
    // Find and remove from allData
    const idx = allData.findIndex(item => item._id === id);
    if (idx !== -1) {
        lastDeletedRecord = allData[idx];
        allData.splice(idx, 1);
        populateTable(allData);
        showUndoSnackbar("Record deleted.", () => {
            // Undo: restore
            allData.splice(idx, 0, lastDeletedRecord);
            populateTable(allData);
            lastDeletedRecord = null;
        });
    }
}

// Finalize delete: Actually remove from server
function finalizeDelete(id) {
  // Change the endpoint to match the backend route
  fetch(`/api/approvals/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(res => res.json())
  .then(result => {
    if (!result.success) {
      alert('Failed to delete record: ' + (result.message || 'Unknown error'));
      // Restore to UI
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

document.getElementById('approval-table').addEventListener('click', function(e) {
    if (e.target.classList.contains('delete-btn')) {
        const id = e.target.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this record?')) {
            softDeleteRecord(id);
        }
    }
});
