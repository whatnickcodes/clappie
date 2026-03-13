# Google Workspace MCP — Full Tool Catalog

Complete inventory of all tools available via `mcporter call google-workspace.<tool>`. Every call requires `user_google_email=marco.baciarello@gmail.com`.

## Gmail (15 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `search_gmail_messages` | Core | Search with Gmail query syntax | `query` | `page_size`, `page_token` |
| `get_gmail_message_content` | Core | Read full message content | `message_id` | — |
| `get_gmail_messages_content_batch` | Core | Batch read messages (max 25) | `message_ids` | `format` (`full`/`metadata`) |
| `send_gmail_message` | Core | Send email, new or reply | `to`, `subject`, `body` | `cc`, `bcc`, `thread_id`, `in_reply_to`, `body_format`, `attachments` |
| `get_gmail_attachment_content` | Extended | Download email attachment | `message_id`, `attachment_id` | — |
| `get_gmail_thread_content` | Extended | Read full conversation thread | `thread_id` | — |
| `get_gmail_threads_content_batch` | Complete | Batch read threads (max 25) | `thread_ids` | — |
| `draft_gmail_message` | Extended | Create draft email | `subject`, `body` | `to`, `cc`, `bcc`, `thread_id`, `attachments`, `include_signature` |
| `list_gmail_labels` | Extended | List all labels with IDs | — | — |
| `manage_gmail_label` | Extended | Create/update/delete labels | `action` | `name`, `label_id`, `label_list_visibility` |
| `list_gmail_filters` | Extended | List configured filters | — | — |
| `manage_gmail_filter` | Extended | Create or delete filters | `action` | `criteria`, `filter_action`, `filter_id` |
| `modify_gmail_message_labels` | Extended | Add/remove labels on message | `message_id` | `add_label_ids`, `remove_label_ids` |
| `batch_modify_gmail_message_labels` | Complete | Batch label modification | `message_ids` | `add_label_ids`, `remove_label_ids` |
| `start_google_auth` | Complete | Legacy OAuth 2.0 trigger | — | — |

## Google Calendar (4 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `list_calendars` | Core | List all accessible calendars | — | — |
| `get_events` | Core | Get events by time range or ID | — | `calendar_id`, `event_id`, `time_min`, `time_max`, `query`, `max_results` |
| `manage_event` | Core | Create/update/delete events | `action` | `summary`, `start_time`, `end_time`, `calendar_id`, `event_id`, `description`, `location`, `attendees`, `timezone`, `add_google_meet` |
| `query_freebusy` | Extended | Check calendar availability | `time_min`, `time_max` | `calendar_ids` |

## Google Drive (14 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `search_drive_files` | Core | Search files and folders | `query` | `page_size`, `file_type`, `drive_id`, `corpora` |
| `get_drive_file_content` | Core | Read file content | `file_id` | — |
| `get_drive_file_download_url` | Core | Download file to disk | `file_id` | `export_format` |
| `create_drive_file` | Core | Create new file | `file_name` | `content`, `folder_id`, `mime_type`, `fileUrl` |
| `create_drive_folder` | Core | Create folder | `folder_name` | `parent_folder_id` |
| `import_to_google_doc` | Core | Import file as Google Doc | `file_name` | `content`, `file_path`, `file_url`, `source_format`, `folder_id` |
| `get_drive_shareable_link` | Core | Get shareable link | `file_id` | — |
| `list_drive_items` | Extended | List folder contents | — | `folder_id`, `page_size`, `file_type`, `drive_id` |
| `copy_drive_file` | Extended | Copy file with optional rename | `file_id` | `new_name`, `parent_folder_id` |
| `update_drive_file` | Extended | Update metadata, move, star/trash | `file_id` | `name`, `description`, `add_parents`, `remove_parents`, `starred`, `trashed` |
| `manage_drive_access` | Extended | Grant/update/revoke permissions | `file_id`, `action` | `share_with`, `role`, `share_type`, `permission_id`, `recipients` |
| `set_drive_file_permissions` | Extended | Set link sharing settings | `file_id` | `link_sharing`, `writers_can_share` |
| `get_drive_file_permissions` | Complete | Get detailed permissions | `file_id` | — |
| `check_drive_file_public_access` | Complete | Check if file is public | `file_name` | — |

## Google Docs (18 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `get_doc_content` | Core | Read document text | `document_id` | — |
| `create_doc` | Core | Create new Google Doc | `title` | `content` |
| `modify_doc_text` | Core | Insert/replace/format text | `document_id`, `start_index` | `end_index`, `text`, `bold`, `italic`, `font_size`, `link_url` |
| `search_docs` | Extended | Find docs by name | `query` | `page_size` |
| `find_and_replace_doc` | Extended | Global find-and-replace | `document_id`, `find_text`, `replace_text` | `match_case` |
| `list_docs_in_folder` | Extended | List docs in folder | — | `folder_id`, `page_size` |
| `insert_doc_elements` | Extended | Insert table/list/page break | `document_id`, `element_type`, `index` | `rows`, `columns`, `text` |
| `update_paragraph_style` | Extended | Heading, alignment, spacing | `document_id`, `start_index`, `end_index` | `heading_level`, `alignment`, `line_spacing` |
| `get_doc_as_markdown` | Extended | Export as Markdown | `document_id` | `include_comments`, `comment_mode` |
| `export_doc_to_pdf` | Extended | Export to PDF in Drive | `document_id` | `pdf_filename`, `folder_id` |
| `insert_doc_image` | Complete | Insert image from Drive/URL | `document_id`, `image_source`, `index` | `width`, `height` |
| `update_doc_headers_footers` | Complete | Modify header/footer | `document_id`, `section_type`, `content` | `header_footer_type` |
| `batch_update_doc` | Complete | Execute multiple operations | `document_id`, `operations` | — |
| `inspect_doc_structure` | Complete | Analyze layout and indices | `document_id` | `detailed`, `tab_id` |
| `create_table_with_data` | Complete | Create populated table | `document_id`, `table_data`, `index` | `bold_headers` |
| `debug_table_structure` | Complete | Diagnostic for table cells | `document_id` | `table_index` |
| `list_document_comments` | Complete | List all doc comments | `document_id` | — |
| `manage_document_comment` | Complete | Create/reply/resolve comment | `document_id`, `action` | `comment_content`, `comment_id` |

## Google Sheets (10 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `read_sheet_values` | Core | Read cell ranges | `spreadsheet_id` | `range_name`, `include_hyperlinks` |
| `modify_sheet_values` | Core | Write or clear cells | `spreadsheet_id`, `range_name` | `values`, `value_input_option`, `clear_values` |
| `create_spreadsheet` | Core | Create new spreadsheet | `title` | `sheet_names` |
| `list_spreadsheets` | Extended | List accessible spreadsheets | — | `max_results` |
| `get_spreadsheet_info` | Extended | Get metadata and sheet names | `spreadsheet_id` | — |
| `format_sheet_range` | Extended | Apply visual formatting | `spreadsheet_id`, `range_name` | `background_color`, `text_color`, `bold`, `font_size`, `number_format_type` |
| `create_sheet` | Complete | Add sheet tab | `spreadsheet_id`, `sheet_name` | — |
| `manage_conditional_formatting` | Complete | Add/update/delete cond. format | `spreadsheet_id`, `action` | `range_name`, `condition_type`, `background_color`, `rule_index` |
| `list_spreadsheet_comments` | Complete | List all comments | `spreadsheet_id` | — |
| `manage_spreadsheet_comment` | Complete | Create/reply/resolve comment | `spreadsheet_id`, `action` | `comment_content`, `comment_id` |

## Google Slides (7 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `create_presentation` | Core | Create new presentation | — | `title` |
| `get_presentation` | Core | Get presentation details | `presentation_id` | — |
| `batch_update_presentation` | Extended | Apply multiple slide updates | `presentation_id`, `requests` | — |
| `get_page` | Extended | Get single slide details | `presentation_id`, `page_object_id` | — |
| `get_page_thumbnail` | Extended | Generate slide thumbnail URL | `presentation_id`, `page_object_id` | `thumbnail_size` |
| `list_presentation_comments` | Complete | List all comments | `presentation_id` | — |
| `manage_presentation_comment` | Complete | Create/reply/resolve comment | `presentation_id`, `action` | `comment_content`, `comment_id` |

## Google Forms (6 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `create_form` | Core | Create new form | `title` | `description`, `document_title` |
| `get_form` | Core | Get form details and URLs | `form_id` | — |
| `list_form_responses` | Extended | List responses with pagination | `form_id` | `page_size`, `page_token` |
| `set_publish_settings` | Complete | Configure publish settings | `form_id` | `publish_as_template`, `require_authentication` |
| `get_form_response` | Complete | Get single response | `form_id`, `response_id` | — |
| `batch_update_form` | Complete | Batch update questions/settings | `form_id`, `requests` | — |

## Google Tasks (6 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `list_tasks` | Core | List tasks with filtering | `task_list_id` | `max_results`, `show_completed`, `due_min`, `due_max` |
| `get_task` | Core | Get single task | `task_list_id`, `task_id` | — |
| `manage_task` | Core | Create/update/delete/move task | `action`, `task_list_id` | `task_id`, `title`, `notes`, `status`, `due`, `parent` |
| `list_task_lists` | Complete | List all task lists | — | `max_results` |
| `get_task_list` | Complete | Get task list details | `task_list_id` | — |
| `manage_task_list` | Complete | Create/update/delete/clear list | `action` | `task_list_id`, `title` |

## Google Contacts (8 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `search_contacts` | Core | Search by name/email/phone | `query` | `page_size` |
| `get_contact` | Core | Get contact details | `contact_id` | — |
| `list_contacts` | Core | List contacts with pagination | — | `page_size`, `page_token`, `sort_order` |
| `manage_contact` | Core | Create/update/delete contact | `action` | `contact_id`, `given_name`, `family_name`, `email`, `phone`, `organization` |
| `list_contact_groups` | Extended | List contact groups | — | `page_size` |
| `get_contact_group` | Extended | Get group with members | `group_id` | `max_members` |
| `manage_contacts_batch` | Complete | Batch create/update/delete | `action` | `contacts`, `updates`, `contact_ids` |
| `manage_contact_group` | Complete | Create/update/delete groups | `action` | `group_id`, `name`, `add_contact_ids`, `remove_contact_ids` |

## Google Chat (6 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `get_messages` | Core | Get messages from a space | `space_id` | `page_size`, `order_by` |
| `send_message` | Core | Send message to a space | `space_id`, `message_text` | `thread_key`, `thread_name` |
| `search_messages` | Core | Search across Chat spaces | `query` | `space_id`, `page_size` |
| `create_reaction` | Core | Add emoji reaction | `message_id`, `emoji_unicode` | — |
| `list_spaces` | Extended | List Chat spaces and DMs | — | `page_size`, `space_type` |
| `download_chat_attachment` | Extended | Download chat attachment | `message_id` | `attachment_index` |

## Google Apps Script (14 tools)

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `list_script_projects` | Core | List Apps Script projects | — | `page_size` |
| `get_script_project` | Core | Get project with source files | `script_id` | — |
| `get_script_content` | Core | Get specific file content | `script_id`, `file_name` | — |
| `create_script_project` | Core | Create standalone/bound project | `title` | `parent_id` |
| `update_script_content` | Core | Update/create project files | `script_id`, `files` | — |
| `run_script_function` | Core | Execute deployed function | `script_id`, `function_name` | `parameters`, `dev_mode` |
| `generate_trigger_code` | Core | Generate trigger code (not create) | `trigger_type`, `function_name` | `schedule` |
| `list_deployments` | Extended | List project deployments | `script_id` | — |
| `manage_deployment` | Extended | Create/update/delete deployment | `action`, `script_id` | `deployment_id`, `description` |
| `list_script_processes` | Extended | View recent executions | — | `page_size`, `script_id` |
| `delete_script_project` | Extended | Permanently delete project | `script_id` | — |
| `list_versions` | Extended | List version snapshots | `script_id` | — |
| `create_version` | Extended | Create immutable snapshot | `script_id` | `description` |
| `get_version` | Extended | Get version details | `script_id`, `version_number` | — |
| `get_script_metrics` | Extended | Execution analytics | `script_id` | `metrics_granularity` |

## Custom Search (2 tools)

**Not configured on Zoidberg.** Requires `GOOGLE_PSE_API_KEY` + `GOOGLE_PSE_ENGINE_ID` env vars.

| Tool | Tier | Description | Required Params | Notable Optional Params |
|------|------|-------------|-----------------|------------------------|
| `search_custom` | Core | Web search via PSE | `q` | `num`, `safe`, `search_type`, `site_search`, `date_restrict`, `file_type` |
| `get_search_engine_info` | Complete | Get PSE config metadata | — | — |
