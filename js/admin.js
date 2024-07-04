jQuery(document).ready(($) => {
    const app = $('#dtt-app');
    let changes = {};

    const fetchContentTypes = async () => {
        const response = await fetch('/wp-json/dtt/v1/content-types');
        return await response.json();
    };

    const fetchPosts = async (postType) => {
        const response = await fetch(`/wp-json/dtt/v1/posts?post_type=${postType}`);
        return await response.json();
    };

    const savePost = async (postId, data) => {
        const response = await fetch(`/wp-json/dtt/v1/save-post`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': wpApiSettings.nonce
            },
            body: JSON.stringify({
                post_id: postId,
                ...data,
                _wpnonce: wpApiSettings.nonce // Add nonce to the body
            })
        });
        return await response.json();
    };

    const renderContentTypes = (contentTypes) => {
        const container = $('<div>').addClass('dtt-content-types');
        contentTypes.forEach((type) => {
            const button = $(`<button>${type.labels.name}</button>`)
                .click(() => window.location.href = `admin.php?page=dt-tables-${type.name}`);
            container.append(button);
        });
        app.html(container);
    };

    const renderPosts = async (posts) => {
        const headers = ['ID', 'Title', 'Slug', 'Content'];
        const customFieldsKeys = Object.keys(posts[0].fields || {});
        const hiddenFieldsKeys = customFieldsKeys.filter(key => key.startsWith('_'));

        let tableHtml = `
            <div class="dtt-content-types">
                <button id="save-all-button">Save All Changes</button>
                <button id="preview-changes-button">Preview Changes</button>
                <label><input type="checkbox" id="toggle-hidden-fields"> Show Hidden Fields</label>
            </div>
            <table class="dtt-posts-table">
                <thead>
                    <tr>
                        ${headers.map(header => `<th>${header}</th>`).join('')}
                        ${customFieldsKeys.map(key => `
                            <th class="${key.startsWith('_') ? 'hidden-field' : ''}">${key}</th>
                        `).join('')}
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${posts.map(post => `
                        <tr data-post-id="${post.ID}">
                            <td><a href="${post.link}" target="_blank">${post.ID}</a></td>
                            <td><input type="text" name="title" value="${post.title}" data-initial-value="${post.title}"></td>
                            <td><input type="text" name="slug" value="${post.slug}" data-initial-value="${post.slug}"></td>
                            <td><textarea name="content" data-initial-value="${post.content}">${post.content}</textarea></td>
                            ${customFieldsKeys.map(key => `
                                <td class="${key.startsWith('_') ? 'hidden-field' : ''}"><input type="text" name="${key}" value="${post.fields[key]}" data-key="${key}" data-initial-value="${post.fields[key]}"></td>
                            `).join('')}
                            <td><button class="save-button">Save</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        app.html(tableHtml);

        app.find('.save-button').each((index, button) => {
            const row = $(button).closest('tr');
            const postId = posts[index].ID;
            $(button).click(() => saveCustomFields(postId, row));
        });

        app.find('input, textarea').on('input', function() {
            const row = $(this).closest('tr');
            const postId = row.data('post-id');
            if (!changes[postId]) {
                changes[postId] = { custom_fields: {} };
            }

            changes[postId].title = row.find('input[name="title"]').val();
            changes[postId].slug = row.find('input[name="slug"]').val();
            changes[postId].content = row.find('textarea[name="content"]').val();
            customFieldsKeys.forEach((key) => {
                const value = row.find(`input[name="${key}"]`).val();
                if (value !== undefined && value !== '') {
                    if(changes[postId].custom_fields){
                        changes[postId].custom_fields[key] = value;
                    }
                }
            });

            // Remove unchanged fields
            for (const field in changes[postId]) {
                if (field === 'custom_fields') {
                    for (const key in changes[postId].custom_fields) {
                        const currentValue = row.find(`input[name="${key}"]`).val();
                        const initialValue = row.find(`input[name="${key}"]`).attr('data-initial-value');
                        if (currentValue === initialValue) {
                            delete changes[postId].custom_fields[key];
                        }
                    }
                    if ($.isEmptyObject(changes[postId].custom_fields)) {
                        delete changes[postId].custom_fields;
                    }
                } else {
                    const currentValue = row.find(`[name="${field}"]`).val();
                    const initialValue = row.find(`[name="${field}"]`).attr('data-initial-value');
                    if (currentValue === initialValue) {
                        delete changes[postId][field];
                    }
                }
            }

            if ($.isEmptyObject(changes[postId])) {
                delete changes[postId];
            }
        });

        $('#save-all-button').click(saveAllChanges);
        $('#preview-changes-button').click(previewChanges);

        $('#toggle-hidden-fields').change(function() {
            if (this.checked) {
                $('.hidden-field').show();
            } else {
                $('.hidden-field').hide();
            }
        });
    };

    const saveCustomFields = async (postId, row) => {
        const customFields = {};
        row.find('input[type="text"]').each(function() {
            const key = $(this).data('key');
            if (key) {
                const value = $(this).val();
                if (value !== undefined && value !== '') {
                    customFields[key] = value;
                }
            }
        });

        const data = {
            title: row.find('input[name="title"]').val(),
            slug: row.find('input[name="slug"]').val(),
            content: row.find('textarea[name="content"]').val(),
            custom_fields: customFields
        };

        const dataToSend = filterChangedValues(row, data);
        if ($.isEmptyObject(dataToSend)) {
            alert('No changes to save.');
            return;
        }

        const response = await savePost(postId, dataToSend);
        if (response.status === 'success') {
            alert('Post saved successfully!');
        } else {
            alert('Failed to save the post.');
        }
    };

    const saveAllChanges = async () => {
        for (const postId in changes) {
            const change = changes[postId];
            const row = $(`tr[data-post-id="${postId}"]`);
            const dataToSend = filterChangedValues(row, change);
            if (!$.isEmptyObject(dataToSend)) {
                const response = await savePost(postId, dataToSend);
                if (response.status === 'error') {
                    alert('Failed to save some changes.');
                    return;
                }
            }
        }
        alert('All changes saved successfully!');
        changes = {};
    };

    const previewChanges = () => {
        let previewHtml = '<div><h2>Preview Changes</h2>';
        for (const postId in changes) {
            const change = changes[postId];
            const row = $(`tr[data-post-id="${postId}"]`);
            const filteredChange = filterChangedValues(row, change);
            if (!$.isEmptyObject(filteredChange)) {
                previewHtml += `<h3>Post ID: ${postId}</h3>`;
                previewHtml += `<pre>${JSON.stringify(filteredChange, null, 2)}</pre>`;
            }
        }
        previewHtml += '</div>';
        const previewWindow = window.open('', 'Preview Changes', 'width=600,height=400');
        previewWindow.document.write(previewHtml);
        previewWindow.document.close();
    };

    const filterChangedValues = (row, data) => {
        const changed = {};

        if (row.find('input[name="title"]').val() !== row.find('input[name="title"]').attr('data-initial-value')) {
            changed.title = data.title;
        }
        if (row.find('input[name="slug"]').val() !== row.find('input[name="slug"]').attr('data-initial-value')) {
            changed.slug = data.slug;
        }
        if (row.find('textarea[name="content"]').val() !== row.find('textarea[name="content"]').attr('data-initial-value')) {
            changed.content = data.content;
        }

        changed.custom_fields = {};
        for (const key in data.custom_fields) {
            if (
                row.find(`input[name="${key}"]`).val() !== row.find(`input[name="${key}"]`).attr('data-initial-value') &&
                data.custom_fields[key] !== undefined &&
                data.custom_fields[key] !== ''
            ) {
                changed.custom_fields[key] = data.custom_fields[key];
            }
        }

        if ($.isEmptyObject(changed.custom_fields)) {
            delete changed.custom_fields;
        }

        return changed;
    };

    const loadContentTypes = async () => {
        const contentTypes = await fetchContentTypes();
        renderContentTypes(contentTypes);
    };

    const loadPosts = async (postType) => {
        const posts = await fetchPosts(postType);
        posts.forEach(post => {
            post.link = `${window.location.origin}/?p=${post.ID}`;
        });
        renderPosts(posts);
    };

    const postType = app.data('post-type');
    if (postType && postType !== 'dt-tables') {
        loadPosts(postType);
    } else {
        loadContentTypes();
    }
});
