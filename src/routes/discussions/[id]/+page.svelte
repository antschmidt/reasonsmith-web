<script lang="ts">
  import { page } from '$app/stores';
  // Avoid importing gql to prevent type resolution issues; use plain string
  import { nhost } from '$lib/nhostClient';
  import { onMount } from 'svelte';
  import { CREATE_POST_DRAFT } from '$lib/graphql/queries';
  import { createDraftAutosaver, type DraftAutosaver } from '$lib';
  import { getStyleConfig, WRITING_STYLES, validateStyleRequirements, formatChicagoCitation, formatChicagoSource, processCitationReferences, type WritingStyle, type StyleMetadata, type Citation, type Source } from '$lib/types/writingStyle';
  import CitationForm from '$lib/components/CitationForm.svelte';
  import { checkPostDeletable, deletePost, checkDiscussionDeletable, deleteDiscussion, confirmDeletion } from '$lib/utils/deletePost';

  let discussion: any = null;
  let loading = true;
  let error: Error | null = null;
  let authReady = false;

  // New comment form state
  let newComment = '';
  let submitting = false;
  let submitError: string | null = null;
  let user = nhost.auth.getUser();
  nhost.auth.onAuthStateChanged(() => { 
    user = nhost.auth.getUser(); 
    authReady = true;
  });

  let draftPostId: string | null = null;
  let draftAutosaver: DraftAutosaver | null = null;
  let draftLoaded = false; // prevents duplicate fetch
  let lastSavedAt: number | null = null;
  let hasPending = false;
  let focusReplyOnMount = false;


  const GET_DISCUSSION_DETAILS = `
    query GetDiscussionDetails($discussionId: uuid!) {
      discussion(where: { id: { _eq: $discussionId } }) {
        id
        title
        description
        current_version_id
        # current_version: discussion_version(where: {id: {_eq: current_version_id}}) @skip(if: true) # placeholder - disabled
        created_at
        contributor { id display_name }
        posts(where: { status: { _eq: "approved" } }, order_by: { created_at: asc }) {
          id
          content
          created_at
          context_version_id
          contributor { id display_name }
        }
      }
    }
  `;


  const GET_EXISTING_DRAFT = `
    query GetExistingDraft($discussionId: uuid!, $authorId: uuid!) {
      post(where: {discussion_id: {_eq: $discussionId}, author_id: {_eq: $authorId}, status: {_eq: "draft"}}, limit: 1, order_by: {updated_at: desc}) {
        id
        draft_content
        updated_at
      }
    }
  `;

  const CREATE_DISCUSSION_VERSION = `
    mutation CreateDiscussionVersion($discussionId: uuid!, $title: String!, $description: String!, $versionNumber: Int!) {
      insert_discussion_version_one(object: {
        discussion_id: $discussionId,
        title: $title,
        description: $description,
        version_number: $versionNumber
      }) { id version_number title description created_at }
    }
  `;
  const UPDATE_DISCUSSION_CURRENT_VERSION = `
    mutation UpdateDiscussionCurrentVersion($discussionId: uuid!, $versionId: uuid!, $title: String!, $description: String!) {
      update_discussion(where: {id: {_eq: $discussionId}}, _set: {current_version_id: $versionId, title: $title, description: $description}) { returning { id current_version_id title description } }
    }
  `;

  const GET_DISCUSSION_VERSION = `
    query GetDiscussionVersion($versionId: uuid!) {
      discussion_version(where: {id: {_eq: $versionId}}) {
        id
        version_number
        title
        description
        created_at
      }
    }
  `;

  const GET_LATEST_VERSION_NUMBER = `
    query LatestVersion($discussionId: uuid!) {
      discussion_version(where:{discussion_id:{_eq:$discussionId}}, order_by:{version_number: desc}, limit:1){ version_number }
    }
  `;

  let historicalVersion: any = null;
  let versionLoading = false;
  let versionError: string | null = null;

  $: {
    const versionRef = $page.url.searchParams.get('versionRef');
    if (versionRef) {
      versionLoading = true;
      versionError = null;
      nhost.graphql.request(GET_DISCUSSION_VERSION, { versionId: versionRef })
        .then(({ data, error }) => {
          if (error) {
            // error could be array or object; attempt to normalize
            versionError = Array.isArray(error) ? error.map(e => (e as any).message || 'Error').join(', ') : (error as any).message || 'Error';
          } else {
            const versions = (data as any)?.discussion_version;
            historicalVersion = versions?.[0];
          }
        })
        .finally(() => { versionLoading = false; });
    } else {
      historicalVersion = null;
      versionError = null;
      versionLoading = false;
    }
  }

  let editing = false;
  let editTitle = '';
  let editDescription = '';
  let editError: string | null = null;
  let editAutoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  let editLastSavedAt: number | null = null;
  
  // Revision draft state
  let hasUnsavedChanges = false;
  let draftLastSavedAt: number | null = null;
  let publishLoading = false;

  // Writing style and citation state for editing
  let editSelectedStyle: WritingStyle = 'journalistic';
  let editStyleMetadata: StyleMetadata = {
    citations: [],
    sources: []
  };
  let editStyleValidation: { isValid: boolean; issues: string[] } = { isValid: true, issues: [] };
  let showEditCitationForm = false;
  let editCitationFormType: 'citation' | 'source' = 'citation';

  // Comment writing style state
  let commentSelectedStyle: WritingStyle = 'quick_point';
  let commentStyleMetadata: StyleMetadata = {
    citations: [],
    sources: []
  };
  let commentStyleValidation: { isValid: boolean; issues: string[] } = { isValid: true, issues: [] };
  let showCommentCitationForm = false;
  let commentCitationFormType: 'citation' | 'source' = 'citation';


  function updateAutosaveStatus() {
    if (!draftAutosaver) return;
    const st = draftAutosaver.getState();
    lastSavedAt = st.lastSavedAt;
    hasPending = st.hasPending;
  }

  function initAutosaver() {
    if (!draftPostId) return;
    if (draftAutosaver) draftAutosaver.destroy();
    draftAutosaver = createDraftAutosaver({
      postId: draftPostId,
      initialContent: newComment,
      delay: 700,
      minInterval: 2500,
      onSaved: () => { updateAutosaveStatus(); }
    });
    updateAutosaveStatus();
  }

  async function loadExistingDraft() {
    if (!user || draftLoaded) return;
    draftLoaded = true;
    const discussionId = $page.params.id as string;
    const qp = $page.url.searchParams;
    const replyDraftParam = qp.get('replyDraftId');
    if (replyDraftParam) {
      // fetch that specific draft id if belongs to this discussion & user
      const { data, error } = await nhost.graphql.request(`query GetDraftById($id: uuid!, $authorId: uuid!, $discussionId: uuid!) { post(where: {id: {_eq: $id}}) { id draft_content discussion_id author_id } }`, { id: replyDraftParam, authorId: user.id, discussionId });
      if (!error) {
        const posts = (data as any)?.post;
        const candidate = posts?.[0];
        if (candidate && candidate.author_id === user.id && candidate.discussion_id === discussionId) {
          draftPostId = candidate.id;
          newComment = candidate.draft_content || '';
          initAutosaver();
          focusReplyOnMount = true;
          
          // Load citation data from localStorage (until database migration is applied)
          if (typeof localStorage !== 'undefined' && draftPostId) {
            const citationKey = `citations:${draftPostId}`;
            const savedCitations = localStorage.getItem(citationKey);
            if (savedCitations) {
              try {
                const parsed = JSON.parse(savedCitations);
                commentSelectedStyle = parsed.style || 'quick_point';
                commentStyleMetadata = parsed.metadata || {
              citations: [],
              sources: []
            };
                validateCommentStyle();
              } catch (e) {
                // Ignore invalid JSON
              }
            }
          }
          return;
        }
      }
    }
    // fallback to existing most recent draft lookup
    const { data, error } = await nhost.graphql.request(GET_EXISTING_DRAFT, { discussionId, authorId: user.id });
    if (error) return; // silent
    const existing = (data as any)?.post?.[0];
    if (existing) {
      draftPostId = existing.id;
      newComment = existing.draft_content || '';
      initAutosaver();
      
      // Load citation data from localStorage (until database migration is applied)
      if (typeof localStorage !== 'undefined' && draftPostId) {
        const citationKey = `citations:${draftPostId}`;
        const savedCitations = localStorage.getItem(citationKey);
        if (savedCitations) {
          try {
            const parsed = JSON.parse(savedCitations);
            commentSelectedStyle = parsed.style || 'quick_point';
            commentStyleMetadata = parsed.metadata || {
              citations: [],
              sources: []
            };
            validateCommentStyle();
          } catch (e) {
            // Ignore invalid JSON
          }
        }
      }
    }
  }

  async function ensureDraftCreated() {
    if (!user || draftPostId) return;
    const discussionId = $page.params.id as string;
    // create empty draft row immediately
    const { data, error } = await nhost.graphql.request(CREATE_POST_DRAFT, {
      discussionId,
      authorId: user.id,
      draftContent: newComment || ''
    });
    if (error) return; // silent fail; user can still post normally
    draftPostId = (data as any)?.insert_post_one?.id || null;
    initAutosaver();
    // push initial content through autosaver
    if (draftPostId && newComment) draftAutosaver?.handleChange(newComment);
  }

  function onCommentInput(e: Event) {
    newComment = (e.target as HTMLTextAreaElement).value;
    if (!draftPostId) {
      ensureDraftCreated();
    } else {
      draftAutosaver?.handleChange(newComment);
      updateAutosaveStatus();
    }
  }

  async function publishDraft() {
    submitError = null;
    if (!user) { submitError = 'You must be signed in to comment.'; return; }
    if (!newComment.trim()) { submitError = 'Comment cannot be empty.'; return; }
    
    submitting = true;
    try {
      // Ensure draft exists
      if (!draftPostId) {
        await ensureDraftCreated();
      }
      if (!draftPostId) throw new Error('Failed to create draft.');
      
      // Flush current content through autosaver logic
      draftAutosaver?.handleChange(newComment);
      
      // Prepare content with citations included (until database migration is applied)
      let contentWithCitations = newComment;
      const hasCitations = (commentStyleMetadata.citations && commentStyleMetadata.citations.length > 0) || 
                          (commentStyleMetadata.sources && commentStyleMetadata.sources.length > 0);
      
      if (hasCitations) {
        contentWithCitations += '\n\n<!-- CITATION_DATA:' + JSON.stringify({
          style: commentSelectedStyle,
          metadata: commentStyleMetadata
        }) + '-->';
      }
      
      // Publish the draft directly (without good faith scoring)
      const { error } = await nhost.graphql.request(`
        mutation PublishDraft($postId: uuid!, $content: String!) {
          update_post(where: {id: {_eq: $postId}}, _set: {status: "approved", content: $content, draft_content: ""}) {
            returning { id status }
          }
        }`, {
        postId: draftPostId,
        content: contentWithCitations
      });
      
      if (error) throw error;
      
      // Clear composer & reload posts
      newComment = '';
      draftAutosaver?.destroy();
      draftAutosaver = null;
      
      // Clean up citation data from localStorage
      if (typeof localStorage !== 'undefined' && draftPostId) {
        const citationKey = `citations:${draftPostId}`;
        localStorage.removeItem(citationKey);
      }
      
      draftPostId = null;
      draftLoaded = false;
      commentStyleMetadata = {
        citations: [],
        sources: []
      };
      commentSelectedStyle = 'quick_point';
      await refreshApprovedPosts($page.params.id as string);
      
    } catch (e: any) {
      submitError = e.message || 'Failed to publish comment.';
    } finally { submitting = false; }
  }

  async function refreshApprovedPosts(discussionId: string) {
    const result = await nhost.graphql.request(GET_DISCUSSION_DETAILS, { discussionId });
    if ((result as any).error) return;
    const fresh = (result as any).data?.discussion?.[0];
    if (fresh) discussion.posts = fresh.posts; // only need posts
  }

  async function loadDiscussion() {
    try {
      const discussionId = $page.params.id as string;
      const result = await nhost.graphql.request(GET_DISCUSSION_DETAILS, { discussionId });
      if ((result as any).error) { throw (result as any).error; }
      const discussions = (result as any).data.discussion;
      if (!discussions || discussions.length === 0) {
        throw new Error('Discussion not found');
      }
      discussion = discussions[0];
      await loadExistingDraft();
    } catch (e: any) {
      error = e;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    // Give auth a moment to initialize, then mark as ready
    setTimeout(() => {
      authReady = true;
    }, 100);
    
    if (focusReplyOnMount) {
      const ta = document.querySelector('textarea[aria-label="New comment"]') as HTMLTextAreaElement | null;
      if (ta) setTimeout(() => ta.focus(), 50);
    }

    // Handle window resize for auto-resizing textarea
    const handleResize = () => {
      const textarea = document.getElementById('edit-description') as HTMLTextAreaElement;
      if (textarea && editing) {
        autoResizeTextarea(textarea);
      }
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  // Reactive: load discussion when auth becomes ready
  $: if (authReady && !discussion && !error) {
    loadDiscussion();
  }

  function startEdit() {
    editing = true;
    
    // Try to load existing draft first
    const hasDraft = loadDraftFromLocalStorage();
    
    if (!hasDraft) {
      // No draft found, initialize with published content
      editTitle = discussion.title;
      
      // Extract citation data from discussion description if it exists
      const extraction = extractCitationData(discussion.description);
      editDescription = extraction.cleanContent;
      
      if (extraction.citationData) {
        editSelectedStyle = extraction.citationData.writing_style;
        editStyleMetadata = ensureIdsForCitationData(extraction.citationData.style_metadata);
      } else {
        // Reset to defaults if no citation data found
        editSelectedStyle = 'journalistic';
        editStyleMetadata = { citations: [], sources: [] };
      }
      
      hasUnsavedChanges = false;
    }
    
    editError = null;
    editLastSavedAt = null;
    validateEditStyle();

    // Auto-resize textarea after content is loaded
    setTimeout(() => {
      const textarea = document.getElementById('edit-description') as HTMLTextAreaElement;
      if (textarea) {
        autoResizeTextarea(textarea);
      }
    }, 0);
  }

  function cancelEdit() {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        return;
      }
      clearDraftFromLocalStorage();
    }
    editing = false;
    editError = null;
  }

  function saveDraftToLocalStorage() {
    if (!editing || !discussion) return;
    
    try {
      const draftData = {
        title: editTitle.trim(),
        description: editDescription.trim(),
        selectedStyle: editSelectedStyle,
        styleMetadata: editStyleMetadata,
        lastSaved: Date.now()
      };
      
      const draftKey = `discussion_draft:${discussion.id}`;
      localStorage.setItem(draftKey, JSON.stringify(draftData));
      draftLastSavedAt = Date.now();
      hasUnsavedChanges = true;
    } catch (e) {
      console.error('Failed to save draft:', e);
    }
  }

  function loadDraftFromLocalStorage() {
    if (!discussion) return false;
    
    try {
      const draftKey = `discussion_draft:${discussion.id}`;
      const draftData = localStorage.getItem(draftKey);
      
      if (draftData) {
        const draft = JSON.parse(draftData);
        editTitle = draft.title || discussion.title;
        editDescription = draft.description || discussion.description;
        editSelectedStyle = draft.selectedStyle || 'journalistic';
        editStyleMetadata = ensureIdsForCitationData(draft.styleMetadata || { citations: [], sources: [] });
        draftLastSavedAt = draft.lastSaved;
        hasUnsavedChanges = true;
        return true;
      }
    } catch (e) {
      console.error('Failed to load draft:', e);
    }
    return false;
  }

  function clearDraftFromLocalStorage() {
    if (!discussion) return;
    
    try {
      const draftKey = `discussion_draft:${discussion.id}`;
      localStorage.removeItem(draftKey);
      hasUnsavedChanges = false;
      draftLastSavedAt = null;
    } catch (e) {
      console.error('Failed to clear draft:', e);
    }
  }

  async function publishDraftChanges() {
    if (!editing || !discussion || !hasUnsavedChanges) return;
    
    publishLoading = true;
    editError = null;
    
    try {
      // Validate required fields
      if (!editTitle.trim()) { editError = 'Title required'; return; }
      if (!editDescription.trim()) { editError = 'Description required'; return; }
      
      // If no meaningful change, skip
      if (editTitle.trim() === discussion.title && editDescription.trim() === discussion.description) { 
        editing = false; 
        clearDraftFromLocalStorage();
        return; 
      }
      
      // Embed citation data in the description if we have citations/sources
      let descriptionWithCitations = editDescription.trim();
      
      if (editStyleMetadata.citations?.length || editStyleMetadata.sources?.length) {
        const citationData = {
          writing_style: editSelectedStyle,
          style_metadata: editStyleMetadata
        };
        descriptionWithCitations += `\n<!-- CITATION_DATA:${JSON.stringify(citationData)} -->`;
      }
      
      // Get discussion ID and next version
      const discussionId = discussion.id;
      
      // Fetch latest version number
      const latest = await nhost.graphql.request(GET_LATEST_VERSION_NUMBER, { discussionId });
      if ((latest as any).error) throw (latest as any).error;
      const latestNum = (latest as any).data?.discussion_version?.[0]?.version_number || 0;
      const nextVersion = latestNum + 1;
      
      // Create version
      const created = await nhost.graphql.request(CREATE_DISCUSSION_VERSION, { 
        discussionId, 
        title: editTitle.trim(), 
        description: descriptionWithCitations, 
        versionNumber: nextVersion 
      });
      if ((created as any).error) throw (created as any).error;
      const versionId = (created as any).data?.insert_discussion_version_one?.id;
      if (!versionId) throw new Error('Failed to create version');
      
      // Set current version & update root discussion record
      const upd = await nhost.graphql.request(UPDATE_DISCUSSION_CURRENT_VERSION, { 
        discussionId, 
        versionId, 
        title: editTitle.trim(), 
        description: descriptionWithCitations 
      });
      if ((upd as any).error) throw (upd as any).error;
      
      // Update UI
      discussion.title = editTitle.trim();
      discussion.description = descriptionWithCitations;
      discussion.current_version_id = versionId;
      
      // Clear draft and exit editing mode
      clearDraftFromLocalStorage();
      editing = false;
      
    } catch (e: any) {
      editError = e.message || 'Failed to publish changes.';
    } finally { 
      publishLoading = false; 
    }
  }

  function scheduleEditAutoSave() {
    if (editAutoSaveTimeout) {
      clearTimeout(editAutoSaveTimeout);
    }
    editAutoSaveTimeout = setTimeout(() => {
      saveDraftToLocalStorage();
    }, 1500);
  }

  function onEditTitleInput(e: Event) {
    editTitle = (e.target as HTMLInputElement).value;
    scheduleEditAutoSave();
  }

  function onEditDescriptionInput(e: Event) {
    const textarea = e.target as HTMLTextAreaElement;
    editDescription = textarea.value;
    
    // Auto-resize textarea
    autoResizeTextarea(textarea);
    
    scheduleEditAutoSave();
  }

  function autoResizeTextarea(textarea: HTMLTextAreaElement) {
    // Reset height to auto to get the actual scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate new height based on content, with maximum of 80vh
    const maxHeight = Math.floor(window.innerHeight * 0.8);
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    
    // Set the new height
    textarea.style.height = newHeight + 'px';
    
    // Add scrollbar if content exceeds max height
    if (textarea.scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  }
  
  // Note: submitEdit function removed - replaced with publishDraftChanges

  // Citation management functions for editing
  function addEditCitation(item: Citation | Source) {
    if (editCitationFormType === 'citation') {
      const citation = item as Citation;
      editStyleMetadata.citations = [...(editStyleMetadata.citations || []), citation];
    } else {
      const source = item as Source;
      editStyleMetadata.sources = [...(editStyleMetadata.sources || []), source];
    }
    showEditCitationForm = false;
    validateEditStyle();
    // Trigger autosave when citation is added
    scheduleEditAutoSave();
  }

  function removeEditCitation(type: 'citation' | 'source', id: string) {
    if (type === 'citation') {
      editStyleMetadata.citations = editStyleMetadata.citations?.filter(c => c.id !== id) || [];
    } else {
      editStyleMetadata.sources = editStyleMetadata.sources?.filter(s => s.id !== id) || [];
    }
    validateEditStyle();
    // Trigger autosave when citation is removed
    scheduleEditAutoSave();
  }

  function startEditCitation(type: 'citation' | 'source', id: string) {
    let itemToEdit: Citation | Source | null = null;
    
    if (type === 'citation') {
      itemToEdit = editStyleMetadata.citations?.find(c => c.id === id) || null;
    } else {
      itemToEdit = editStyleMetadata.sources?.find(s => s.id === id) || null;
    }
    
    if (itemToEdit) {
      editingEditCitation = itemToEdit;
      editCitationFormType = type;
      showEditCitationForm = true;
    }
  }

  function updateEditCitation(updatedItem: Citation | Source) {
    if (editCitationFormType === 'citation') {
      const index = editStyleMetadata.citations?.findIndex(c => c.id === updatedItem.id) || -1;
      if (index !== -1) {
        editStyleMetadata.citations![index] = updatedItem as Citation;
      }
    } else {
      const index = editStyleMetadata.sources?.findIndex(s => s.id === updatedItem.id) || -1;
      if (index !== -1) {
        editStyleMetadata.sources![index] = updatedItem as Source;
      }
    }
    
    showEditCitationForm = false;
    editingEditCitation = null;
    validateEditStyle();
    scheduleEditAutoSave();
  }

  function cancelEditCitation() {
    showEditCitationForm = false;
    editingEditCitation = null;
  }

  function validateEditStyle() {
    editStyleValidation = validateStyleRequirements(editSelectedStyle, editDescription, editStyleMetadata);
  }

  // Citation reference insertion for editing
  function insertEditCitationReference(citationId: string) {
    const textarea = document.querySelector('#edit-description') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const allCitations = [...(editStyleMetadata.sources || []), ...(editStyleMetadata.citations || [])];
    const citationNumber = allCitations.findIndex(c => c.id === citationId) + 1;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = editDescription.substring(0, start);
    const after = editDescription.substring(end);
    
    editDescription = `${before}[${citationNumber}]${after}`;
    
    // Trigger autosave
    scheduleEditAutoSave();
    
    // Restore cursor position after the inserted citation
    setTimeout(() => {
      textarea.setSelectionRange(start + `[${citationNumber}]`.length, start + `[${citationNumber}]`.length);
      textarea.focus();
    }, 0);
  }

  // Show citation picker for editing
  let showEditCitationPicker = false;
  
  function openEditCitationPicker() {
    const allCitations = [...(editStyleMetadata.sources || []), ...(editStyleMetadata.citations || [])];
    if (allCitations.length === 0) {
      alert('Please add citations or sources first before inserting references.');
      return;
    }
    showEditCitationPicker = true;
  }

  // Citation management functions for comments
  async function addCommentCitation(item: Citation | Source) {
    if (commentCitationFormType === 'citation') {
      const citation = item as Citation;
      commentStyleMetadata.citations = [...(commentStyleMetadata.citations || []), citation];
    } else {
      const source = item as Source;
      commentStyleMetadata.sources = [...(commentStyleMetadata.sources || []), source];
    }
    showCommentCitationForm = false;
    validateCommentStyle();
    
    // Ensure draft exists and save citation metadata
    await ensureDraftCreated();
    // Store citation data in localStorage for now (until database migration is applied)
    if (typeof localStorage !== 'undefined' && draftPostId) {
      const citationKey = `citations:${draftPostId}`;
      localStorage.setItem(citationKey, JSON.stringify({
        style: commentSelectedStyle,
        metadata: commentStyleMetadata
      }));
    }
  }

  async function removeCommentCitation(type: 'citation' | 'source', id: string) {
    if (type === 'citation') {
      commentStyleMetadata.citations = commentStyleMetadata.citations?.filter(c => c.id !== id) || [];
    } else {
      commentStyleMetadata.sources = commentStyleMetadata.sources?.filter(s => s.id !== id) || [];
    }
    validateCommentStyle();
    
    // Update stored citation data
    if (typeof localStorage !== 'undefined' && draftPostId) {
      const citationKey = `citations:${draftPostId}`;
      localStorage.setItem(citationKey, JSON.stringify({
        style: commentSelectedStyle,
        metadata: commentStyleMetadata
      }));
    }
  }

  function startEditCommentCitation(type: 'citation' | 'source', id: string) {
    let itemToEdit: Citation | Source | null = null;
    
    if (type === 'citation') {
      itemToEdit = commentStyleMetadata.citations?.find(c => c.id === id) || null;
    } else {
      itemToEdit = commentStyleMetadata.sources?.find(s => s.id === id) || null;
    }
    
    if (itemToEdit) {
      editingCommentCitation = itemToEdit;
      commentCitationEditFormType = type;
      showCommentCitationEditForm = true;
    }
  }

  function updateCommentCitation(updatedItem: Citation | Source) {
    if (commentCitationEditFormType === 'citation') {
      const index = commentStyleMetadata.citations?.findIndex(c => c.id === updatedItem.id) || -1;
      if (index !== -1) {
        commentStyleMetadata.citations![index] = updatedItem as Citation;
      }
    } else {
      const index = commentStyleMetadata.sources?.findIndex(s => s.id === updatedItem.id) || -1;
      if (index !== -1) {
        commentStyleMetadata.sources![index] = updatedItem as Source;
      }
    }
    
    showCommentCitationEditForm = false;
    editingCommentCitation = null;
    validateCommentStyle();
    
    // Update stored citation data
    if (typeof localStorage !== 'undefined' && draftPostId) {
      const citationKey = `citations:${draftPostId}`;
      localStorage.setItem(citationKey, JSON.stringify({
        style: commentSelectedStyle,
        metadata: commentStyleMetadata
      }));
    }
  }

  function cancelCommentCitationEdit() {
    showCommentCitationEditForm = false;
    editingCommentCitation = null;
  }

  function validateCommentStyle() {
    commentStyleValidation = validateStyleRequirements(commentSelectedStyle, newComment, commentStyleMetadata);
  }

  // Citation reference insertion for comments
  function insertCommentCitationReference(citationId: string) {
    const textarea = document.querySelector('textarea[aria-label="New comment"]') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const allCitations = [...(commentStyleMetadata.sources || []), ...(commentStyleMetadata.citations || [])];
    const citationNumber = allCitations.findIndex(c => c.id === citationId) + 1;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = newComment.substring(0, start);
    const after = newComment.substring(end);
    
    newComment = `${before}[${citationNumber}]${after}`;
    
    // Trigger autosave
    if (draftAutosaver) {
      draftAutosaver.handleChange(newComment);
    }
    
    // Restore cursor position after the inserted citation
    setTimeout(() => {
      textarea.setSelectionRange(start + `[${citationNumber}]`.length, start + `[${citationNumber}]`.length);
      textarea.focus();
    }, 0);
  }

  // Show citation picker for comments
  let showCommentCitationPicker = false;

  // Edit citation/source state
  let editingEditCitation: Citation | Source | null = null;

  let editingCommentCitation: Citation | Source | null = null;
  let commentCitationEditFormType: 'citation' | 'source' = 'citation';
  let showCommentCitationEditForm = false;
  
  function openCommentCitationPicker() {
    const allCitations = [...(commentStyleMetadata.sources || []), ...(commentStyleMetadata.citations || [])];
    if (allCitations.length === 0) {
      alert('Please add citations or sources first before inserting references.');
      return;
    }
    showCommentCitationPicker = true;
  }

  // Delete functionality
  async function handleDeletePost(post: any) {
    if (!user) return;
    
    if (!confirmDeletion('post')) return;

    try {
      const deletionCheck = await checkPostDeletable(
        post.id,
        user.id,
        discussion.id,
        post.created_at
      );

      if (!deletionCheck.canDelete) {
        alert(`Cannot delete post: ${deletionCheck.reason}`);
        return;
      }

      const success = await deletePost(post.id);
      if (success) {
        // Refresh the discussion to show updated posts
        await refreshApprovedPosts(discussion.id);
        alert('Post deleted successfully');
      } else {
        alert('Failed to delete post');
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Error deleting post');
    }
  }

  async function handleDeleteDiscussion() {
    if (!user || !discussion) return;
    
    if (!confirmDeletion('discussion', discussion.title)) return;

    try {
      const deletionCheck = await checkDiscussionDeletable(
        discussion.id,
        user.id
      );

      if (!deletionCheck.canDelete) {
        alert(`Cannot delete discussion: ${deletionCheck.reason}`);
        return;
      }

      const success = await deleteDiscussion(discussion.id, user.id);
      if (success) {
        // Redirect to dashboard after successful deletion
        window.location.href = '/';
      } else {
        alert('Failed to delete discussion');
      }
    } catch (error) {
      console.error('Error deleting discussion:', error);
      alert('Error deleting discussion');
    }
  }

  // Ensure all citations and sources have IDs
  function ensureIdsForCitationData(metadata: StyleMetadata): StyleMetadata {
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    
    return {
      ...metadata,
      citations: metadata.citations?.map(citation => ({
        ...citation,
        id: (citation as any).id || generateId()
      } as Citation)) || [],
      sources: metadata.sources?.map(source => ({
        ...source,
        id: (source as any).id || generateId()
      } as Source)) || []
    };
  }

  // Extract citation data from post content (temporary solution until database migration)
  function extractCitationData(content: string): { cleanContent: string; citationData?: { writing_style: WritingStyle; style_metadata: StyleMetadata } } {
    const citationMatch = content.match(/<!-- CITATION_DATA:(.*?)-->/s);
    if (citationMatch) {
      try {
        const parsed = JSON.parse(citationMatch[1]);
        const cleanContent = content.replace(/\n\n?<!-- CITATION_DATA:.*?-->/s, '');
        
        // Handle both comment format and discussion format
        if (parsed.writing_style && parsed.style_metadata) {
          // Discussion format - ensure IDs exist
          return { 
            cleanContent, 
            citationData: {
              writing_style: parsed.writing_style,
              style_metadata: ensureIdsForCitationData(parsed.style_metadata)
            }
          };
        } else if (parsed.style && parsed.metadata) {
          // Comment format - convert to discussion format and ensure IDs exist
          return { 
            cleanContent, 
            citationData: {
              writing_style: parsed.style,
              style_metadata: ensureIdsForCitationData(parsed.metadata)
            }
          };
        }
        
        // Fallback if format doesn't match either expected structure
        return { cleanContent };
      } catch (e) {
        // If parsing fails, return original content
        return { cleanContent: content };
      }
    }
    return { cleanContent: content };
  }
</script>

<div class="container">
  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <p class="error-message">Error: {error.message}</p>
  {:else if discussion}
    <header class="discussion-header">
      <h1 class="discussion-title">{discussion.title}</h1>
      <p class="discussion-meta">
        Started by {discussion.contributor.display_name} on {new Date(discussion.created_at).toLocaleDateString()}
        {#if user && user.id === discussion.contributor.id}
          <button class="edit-btn" onclick={startEdit}>Edit</button>
          <button class="delete-discussion-btn" onclick={handleDeleteDiscussion} title="Delete discussion">
            🗑️ Delete
          </button>
        {/if}
      </p>
      {#if editing}
        <form class="edit-form" onsubmit={(e) => { e.preventDefault(); publishDraftChanges(); }}>
          <label>
            Title
            <input type="text" bind:value={editTitle} oninput={onEditTitleInput} />
          </label>
          <label>
            Description
            <textarea id="edit-description" rows="3" bind:value={editDescription} oninput={onEditDescriptionInput}></textarea>
          </label>
          
          <!-- Insert Citation Reference Button -->
          <button type="button" class="insert-citation-btn" onclick={openEditCitationPicker}>
            📎 Insert Citation Reference
          </button>

          <!-- Writing Style Selection -->
          <div class="writing-style-selector">
            <span class="style-label">Writing Style</span>
            <div class="style-options" role="radiogroup" aria-labelledby="edit-style-label">
              {#each Object.entries(WRITING_STYLES) as [key, config]}
                <label class="style-option" class:selected={editSelectedStyle === key}>
                  <input type="radio" bind:group={editSelectedStyle} value={key} onchange={validateEditStyle} name="edit-writing-style" />
                  <div class="style-content">
                    <strong>{config.label}</strong>
                    <span>{config.description}</span>
                    <small>{config.minWords}-{config.maxWords} words</small>
                  </div>
                </label>
              {/each}
            </div>
          </div>

          <!-- Citation/Source Management -->
          <div class="citation-section">
            <div class="citation-header">
              <h4>References</h4>
              <div class="citation-buttons">
                <button type="button" class="btn-secondary" onclick={() => {
                  editCitationFormType = 'citation';
                  showEditCitationForm = true;
                }}>
                  Add Citation
                </button>
                <button type="button" class="btn-secondary" onclick={() => {
                  editCitationFormType = 'source';
                  showEditCitationForm = true;
                }}>
                  Add Source
                </button>
              </div>
            </div>

              <!-- Add Citation Form -->
              {#if showEditCitationForm && !editingEditCitation}
                <CitationForm
                  type={editCitationFormType}
                  onAdd={addEditCitation}
                  onCancel={() => showEditCitationForm = false}
                />
              {/if}

              <!-- Edit Citation Form -->
              {#if showEditCitationForm && editingEditCitation}
                <CitationForm
                  type={editCitationFormType}
                  editingItem={editingEditCitation}
                  onAdd={updateEditCitation}
                  onCancel={cancelEditCitation}
                />
              {/if}

              <!-- Display existing citations -->
              {#if editStyleMetadata.citations?.length}
                <div class="citations-list">
                  <h5>Citations:</h5>
                  {#each (editStyleMetadata.citations as Citation[]) as citation}
                    <div class="citation-item">
                      <div class="citation-content">
                        <div class="citation-title">{citation.title}</div>
                        <div class="citation-url"><a href={citation.url} target="_blank">{citation.url}</a></div>
                        {#if citation.author}<div class="citation-author">Author: {citation.author}</div>{/if}
                        {#if citation.publishDate}<div class="citation-date">Published: {citation.publishDate}</div>{/if}
                        {#if citation.publisher}<div class="citation-publisher">Publisher: {citation.publisher}</div>{/if}
                        {#if citation.pageNumber}<div class="citation-page">Page: {citation.pageNumber}</div>{/if}
                        <details class="citation-details">
                          <summary>
                            <span class="summary-arrow">▶</span>
                            <span class="summary-text">Context</span>
                          </summary>
                          <div class="citation-context">
                            <div class="citation-point"><strong>Supports:</strong> {citation.pointSupported}</div>
                            <div class="citation-quote"><strong>Quote:</strong> "{citation.relevantQuote}"</div>
                          </div>
                        </details>
                      </div>
                      <div class="citation-actions">
                        <button type="button" class="insert-ref-btn" onclick={() => insertEditCitationReference(citation.id)} title="Insert citation reference at cursor">Insert Ref</button>
                        <button type="button" class="edit-btn" onclick={() => startEditCitation('citation', citation.id)} title="Edit citation">Edit</button>
                        <button type="button" class="remove-btn" onclick={() => removeEditCitation('citation', citation.id)}>Remove</button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Display existing sources -->
              {#if editStyleMetadata.sources?.length}
                <div class="citations-list">
                  <h5>Sources:</h5>
                  {#each (editStyleMetadata.sources as Source[]) as source}
                    <div class="citation-item">
                      <div class="citation-content">
                        <div class="citation-title">{source.title}</div>
                        <div class="citation-url"><a href={source.url} target="_blank">{source.url}</a></div>
                        {#if source.author}<div class="source-author">Author: {source.author}</div>{/if}
                        {#if source.publishDate}<div class="source-date">Published: {source.publishDate}</div>{/if}
                        {#if source.accessed}<div class="source-accessed">Accessed: {source.accessed}</div>{/if}
                        <details class="citation-details">
                          <summary>
                            <span class="summary-arrow">▶</span>
                            <span class="summary-text">Context</span>
                          </summary>
                          <div class="citation-context">
                            <div class="citation-point"><strong>Supports:</strong> {source.pointSupported}</div>
                            <div class="citation-quote"><strong>Quote:</strong> "{source.relevantQuote}"</div>
                          </div>
                        </details>
                      </div>
                      <div class="citation-actions">
                        <button type="button" class="insert-ref-btn" onclick={() => insertEditCitationReference(source.id)} title="Insert source reference at cursor">Insert Ref</button>
                        <button type="button" class="edit-btn" onclick={() => startEditCitation('source', source.id)} title="Edit source">Edit</button>
                        <button type="button" class="remove-btn" onclick={() => removeEditCitation('source', source.id)}>Remove</button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Citation Picker Modal -->
            {#if showEditCitationPicker}
              {@const allEditCitations = [...(editStyleMetadata.sources || []), ...(editStyleMetadata.citations || [])]}
              <div class="citation-picker-overlay">
                <div class="citation-picker-modal">
                  <div class="citation-picker-header">
                    <h4>Insert Citation Reference</h4>
                    <button type="button" class="close-btn" onclick={() => showEditCitationPicker = false}>✕</button>
                  </div>
                  <div class="citation-picker-content">
                    <p>Click on a reference below to insert it at your cursor position:</p>
                    <div class="picker-references-list">
                      {#each allEditCitations as item, index}
                        <div class="picker-reference-item" onclick={() => { insertEditCitationReference(item.id); showEditCitationPicker = false; }}>
                          <div class="picker-citation-number">[{index + 1}]</div>
                          <div class="picker-citation-preview">
                            {#if 'accessed' in item}
                              {formatChicagoSource(item)}
                            {:else}
                              {formatChicagoCitation(item)}
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Style Validation -->
            {#if !editStyleValidation.isValid}
              <div class="style-validation-errors">
                <h5>Style Requirements:</h5>
                <ul>
                  {#each editStyleValidation.issues as issue}
                    <li>{issue}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          
          <div class="edit-autosave-indicator">
            {#if editLastSavedAt}
              Auto-saved {new Date(editLastSavedAt).toLocaleTimeString()}
            {/if}
          </div>
          
          {#if editError}<p class="error-message">{editError}</p>{/if}
          <div style="display:flex; gap:0.5rem;">
            <button class="btn-primary" type="submit" disabled={publishLoading || !hasUnsavedChanges}>{publishLoading ? 'Publishing…' : 'Publish Changes'}</button>
            <button type="button" class="btn-secondary" onclick={cancelEdit}>Cancel</button>
            {#if draftLastSavedAt}
              <small class="draft-status">Draft saved {new Date(draftLastSavedAt).toLocaleTimeString()}</small>
            {/if}
          </div>
        </form>
      {/if}
      {#if discussion.description}
        {@const extraction = extractCitationData(discussion.description)}
        {@const allCitations = [...(extraction.citationData?.style_metadata?.sources || []), ...(extraction.citationData?.style_metadata?.citations || [])]}
        {@const processedContent = processCitationReferences(extraction.cleanContent, allCitations)}
        <div class="discussion-description">{@html processedContent.replace(/\n/g, '<br>')}</div>
        
        <!-- Display unified reference list if citations exist -->
        {#if extraction.citationData && allCitations.length > 0}
          <div class="discussion-metadata">
            <div class="references-section">
              <h5>References</h5>
              <div class="references-list">
                {#each allCitations as item, index}
                  <div class="reference-item" id="citation-{index + 1}">
                    <div class="chicago-citation">
                      <span class="citation-number">{index + 1}.</span>
                      {#if 'accessed' in item}
                        {formatChicagoSource(item)}
                      {:else}
                        {formatChicagoCitation(item)}
                      {/if}
                    </div>
                    <details class="citation-details">
                      <summary>
                        <span class="summary-arrow">▶</span>
                        <span class="summary-text">Context</span>
                      </summary>
                      <div class="citation-context">
                        <div class="citation-point"><strong>Supports:</strong> {item.pointSupported}</div>
                        <div class="citation-quote"><strong>Quote:</strong> "{item.relevantQuote}"</div>
                      </div>
                    </details>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </header>

    {#if historicalVersion}
      <div class="historical-version-banner">
        <strong>Historical Version (v{historicalVersion.version_number})</strong>
        <div class="historical-title">{historicalVersion.title}</div>
        <div class="historical-description">{@html historicalVersion.description.replace(/\n/g, '<br>')}</div>
        <a href={`/discussions/${discussion.id}`} class="return-current">Return to current version</a>
      </div>
    {:else if versionLoading}
      <div class="historical-version-banner">Loading historical version…</div>
    {:else if versionError}
      <div class="historical-version-banner error-message">{versionError}</div>
    {/if}

    <div class="posts-list">
      {#each discussion.posts as post}
        <div class="post-card" class:journalistic-post={post.writing_style === 'journalistic'} class:academic-post={post.writing_style === 'academic'}>
          <div class="post-meta">
            <strong>{post.contributor.display_name}</strong>
            <span>&middot;</span>
            <time>{new Date(post.created_at).toLocaleString()}</time>
            <span class="writing-style-badge" class:journalistic={post.writing_style === 'journalistic'} class:academic={post.writing_style === 'academic'}>
              {getStyleConfig(post.writing_style || 'quick_point').label}
            </span>
            {#if post.context_version_id}
              <a class="post-version-link" href={`?versionRef=${post.context_version_id}`}>context version</a>
            {/if}
            {#if user && post.contributor.id === user.id}
              <button type="button" class="delete-post-btn" onclick={() => handleDeletePost(post)} title="Delete post">
                🗑️
              </button>
            {/if}
          </div>
          <!-- Extract and display post content with citations -->
          {#snippet postWithCitations()}
            {@const { cleanContent, citationData } = extractCitationData(post.content)}
            {@const allPostCitations = [...(citationData?.style_metadata?.sources || []), ...(citationData?.style_metadata?.citations || [])]}
            {@const processedPostContent = processCitationReferences(cleanContent, allPostCitations)}
            <div class="post-content">
              {@html processedPostContent}
            </div>
            
            <!-- Display citations if they exist (either from database or extracted from content) -->
            {@const displayMetadata = ensureIdsForCitationData(post.style_metadata || citationData?.style_metadata || { citations: [], sources: [] })}
            {@const allPostReferences = [...(displayMetadata.sources || []), ...(displayMetadata.citations || [])]}
            {#if displayMetadata && allPostReferences.length > 0}
            <div class="post-metadata">
              <div class="references-section">
                <h5>References</h5>
                <div class="references-list">
                  {#each allPostReferences as item, index}
                    <div class="reference-item" id="citation-{index + 1}">
                      <div class="chicago-citation">
                        <span class="citation-number">{index + 1}.</span>
                        {#if 'accessed' in item}
                          {formatChicagoSource(item)}
                        {:else}
                          {formatChicagoCitation(item)}
                        {/if}
                      </div>
                      <details class="citation-details">
                        <summary>
                          <span class="summary-arrow">▶</span>
                          <span class="summary-text">Context</span>
                        </summary>
                        <div class="citation-context">
                          <div class="citation-point"><strong>Supports:</strong> {item.pointSupported}</div>
                          <div class="citation-quote"><strong>Quote:</strong> "{item.relevantQuote}"</div>
                        </div>
                      </details>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
            {/if}
          {/snippet}
          {@render postWithCitations()}
        </div>
      {:else}
        <p>No posts in this discussion yet. Be the first to contribute!</p>
      {/each}
    </div>

    <section class="add-comment">
      <h2 class="add-comment-title">Add a Comment</h2>
      {#if !user}
        <p class="signin-hint">Please sign in to participate.</p>
      {:else}
        <form onsubmit={(e) => { e.preventDefault(); publishDraft(); }} class="comment-form">
          <!-- Writing Style Selection for Comments -->
          <div class="writing-style-selector">
            <span class="style-label">Comment Style</span>
            <div class="style-options" role="radiogroup" aria-labelledby="comment-style-label">
              {#each Object.entries(WRITING_STYLES) as [key, config]}
                <label class="style-option" class:selected={commentSelectedStyle === key}>
                  <input type="radio" bind:group={commentSelectedStyle} value={key} onchange={validateCommentStyle} name="comment-writing-style" />
                  <div class="style-content">
                    <strong>{config.label}</strong>
                    <span>{config.description}</span>
                    <small>{config.minWords}-{config.maxWords} words</small>
                  </div>
                </label>
              {/each}
            </div>
          </div>

          <textarea 
            bind:value={newComment} 
            oninput={(e) => { onCommentInput(e); validateCommentStyle(); }} 
            onfocus={loadExistingDraft} 
            rows="5" 
            placeholder={getStyleConfig(commentSelectedStyle).placeholder}
            aria-label="New comment"
          ></textarea>
          
          <!-- Insert Citation Reference Button -->
          <button type="button" class="insert-citation-btn" onclick={openCommentCitationPicker}>
            📎 Insert Citation Reference
          </button>

          <!-- Citation/Source Management for Comments -->
            <div class="citation-section">
              <div class="citation-header">
                <h4>References</h4>
                <div class="citation-buttons">
                  <button type="button" class="btn-secondary" onclick={() => {
                    commentCitationFormType = 'citation';
                    showCommentCitationForm = true;
                  }}>
                    Add Citation
                  </button>
                  <button type="button" class="btn-secondary" onclick={() => {
                    commentCitationFormType = 'source';
                    showCommentCitationForm = true;
                  }}>
                    Add Source
                  </button>
                </div>
              </div>

              <!-- Add Comment Citation Form -->
              {#if showCommentCitationForm && !editingCommentCitation}
                <CitationForm
                  type={commentCitationFormType}
                  onAdd={addCommentCitation}
                  onCancel={() => showCommentCitationForm = false}
                />
              {/if}

              <!-- Edit Comment Citation Form -->
              {#if showCommentCitationEditForm && editingCommentCitation}
                <CitationForm
                  type={commentCitationEditFormType}
                  editingItem={editingCommentCitation}
                  onAdd={updateCommentCitation}
                  onCancel={cancelCommentCitationEdit}
                />
              {/if}

              <!-- Display existing citations -->
              {#if commentStyleMetadata.citations?.length}
                <div class="citations-list">
                  <h5>Citations:</h5>
                  {#each (commentStyleMetadata.citations as Citation[]) as citation}
                    <div class="citation-item">
                      <div class="citation-content">
                        <div class="citation-title">{citation.title}</div>
                        <div class="citation-url"><a href={citation.url} target="_blank">{citation.url}</a></div>
                        {#if citation.author}<div class="citation-author">Author: {citation.author}</div>{/if}
                        {#if citation.publishDate}<div class="citation-date">Published: {citation.publishDate}</div>{/if}
                        {#if citation.publisher}<div class="citation-publisher">Publisher: {citation.publisher}</div>{/if}
                        {#if citation.pageNumber}<div class="citation-page">Page: {citation.pageNumber}</div>{/if}
                        <details class="citation-details">
                          <summary>
                            <span class="summary-arrow">▶</span>
                            <span class="summary-text">Context</span>
                          </summary>
                          <div class="citation-context">
                            <div class="citation-point"><strong>Supports:</strong> {citation.pointSupported}</div>
                            <div class="citation-quote"><strong>Quote:</strong> "{citation.relevantQuote}"</div>
                          </div>
                        </details>
                      </div>
                      <div class="citation-actions">
                        <button type="button" class="insert-ref-btn" onclick={() => insertCommentCitationReference(citation.id)} title="Insert citation reference at cursor">Insert Ref</button>
                        <button type="button" class="edit-btn" onclick={() => startEditCommentCitation('citation', citation.id)} title="Edit citation">Edit</button>
                        <button type="button" class="remove-btn" onclick={() => removeCommentCitation('citation', citation.id)}>Remove</button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Display existing sources -->
              {#if commentStyleMetadata.sources?.length}
                <div class="citations-list">
                  <h5>Sources:</h5>
                  {#each (commentStyleMetadata.sources as Source[]) as source}
                    <div class="citation-item">
                      <div class="citation-content">
                        <div class="citation-title">{source.title}</div>
                        <div class="citation-url"><a href={source.url} target="_blank">{source.url}</a></div>
                        {#if source.author}<div class="source-author">Author: {source.author}</div>{/if}
                        {#if source.publishDate}<div class="source-date">Published: {source.publishDate}</div>{/if}
                        {#if source.accessed}<div class="source-accessed">Accessed: {source.accessed}</div>{/if}
                        <details class="citation-details">
                          <summary>
                            <span class="summary-arrow">▶</span>
                            <span class="summary-text">Context</span>
                          </summary>
                          <div class="citation-context">
                            <div class="citation-point"><strong>Supports:</strong> {source.pointSupported}</div>
                            <div class="citation-quote"><strong>Quote:</strong> "{source.relevantQuote}"</div>
                          </div>
                        </details>
                      </div>
                      <div class="citation-actions">
                        <button type="button" class="insert-ref-btn" onclick={() => insertCommentCitationReference(source.id)} title="Insert source reference at cursor">Insert Ref</button>
                        <button type="button" class="edit-btn" onclick={() => startEditCommentCitation('source', source.id)} title="Edit source">Edit</button>
                        <button type="button" class="remove-btn" onclick={() => removeCommentCitation('source', source.id)}>Remove</button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Citation Picker Modal for Comments -->
            {#if showCommentCitationPicker}
              {@const allCommentCitations = [...(commentStyleMetadata.sources || []), ...(commentStyleMetadata.citations || [])]}
              <div class="citation-picker-overlay">
                <div class="citation-picker-modal">
                  <div class="citation-picker-header">
                    <h4>Insert Citation Reference</h4>
                    <button type="button" class="close-btn" onclick={() => showCommentCitationPicker = false}>✕</button>
                  </div>
                  <div class="citation-picker-content">
                    <p>Click on a reference below to insert it at your cursor position:</p>
                    <div class="picker-references-list">
                      {#each allCommentCitations as item, index}
                        <div class="picker-reference-item" onclick={() => { insertCommentCitationReference(item.id); showCommentCitationPicker = false; }}>
                          <div class="picker-citation-number">[{index + 1}]</div>
                          <div class="picker-citation-preview">
                            {#if 'accessed' in item}
                              {formatChicagoSource(item)}
                            {:else}
                              {formatChicagoCitation(item)}
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Style Validation for Comments -->
            {#if !commentStyleValidation.isValid}
              <div class="style-validation-errors">
                <h5>Style Requirements:</h5>
                <ul>
                  {#each commentStyleValidation.issues as issue}
                    <li>{issue}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          {#if submitError}<p class="error-message" style="margin-top:0.5rem;">{submitError}</p>{/if}
          
          <div class="comment-actions" style="flex-direction:column; align-items:flex-end; gap:0.4rem;">
            <div class="autosave-indicator" aria-live="polite">
              {#if draftPostId}
                {#if hasPending}
                  <span class="pending-dot" aria-hidden="true"></span> Saving…
                {:else if lastSavedAt}
                  Saved {new Date(lastSavedAt).toLocaleTimeString()}
                {:else}
                  Draft created
                {/if}
              {/if}
            </div>
            <button type="submit" class="btn-primary" disabled={submitting || !newComment.trim() || !commentStyleValidation.isValid}>
              {#if submitting}
                Publishing…
              {:else}
                Publish Comment
              {/if}
            </button>
          </div>
        </form>
      {/if}
    </section>
  {:else}
    <p>Discussion not found.</p>
  {/if}
</div>

<style>
  .container {
    max-width: 900px;
    margin: 2rem auto;
    padding: 2rem;
  }
  /* Removed obsolete .back-link styles */
  .discussion-header {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }
  .discussion-title {
    font-size: 2.25rem;
    font-weight: 700;
    font-family: var(--font-family-display);
    margin-bottom: 0.5rem;
  }
  .discussion-meta {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
  }
  .discussion-description {
    font-size: 1.125rem;
    color: var(--color-text-secondary);
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .discussion-description p {
    margin: 0 0 1rem 0;
  }

  .discussion-description p:last-child {
    margin-bottom: 0;
  }

  .discussion-description strong {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .discussion-description em {
    font-style: italic;
  }

  .discussion-description ul, .discussion-description ol {
    margin: 1rem 0;
    padding-left: 2rem;
  }

  .discussion-description li {
    margin-bottom: 0.5rem;
  }

  .discussion-metadata {
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    padding: 1rem;
    margin-top: 1rem;
  }

  .citation-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .chicago-citation {
    font-size: 0.8rem;
    line-height: 1.5;
    margin-bottom: 0.75rem;
  }

  .citation-number {
    font-weight: 600;
    color: var(--color-primary);
    margin-right: 0.5rem;
  }

  .citation-context {
    margin-left: 1.5rem;
    padding: 0.5rem;
    background: var(--color-surface-alt);
    border-left: 3px solid var(--color-border);
    font-size: 0.85rem;
  }

  .citation-context .citation-point {
    margin-bottom: 0.25rem;
  }

  .citation-context .citation-quote {
    font-style: italic;
    color: var(--color-text-secondary);
  }

  .citation-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .insert-ref-btn {
    background: var(--color-primary);
    color: white;
    border: none;
    padding: 0.25rem 0.75rem;
    border-radius: var(--border-radius-sm);
    font-size: 0.8rem;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .insert-ref-btn:hover {
    opacity: 0.8;
  }

  /* Superscript citation reference styling */
  :global(.citation-ref) {
    color: var(--color-primary) !important;
    text-decoration: none !important;
    font-weight: 600 !important;
    cursor: pointer !important;
  }

  :global(.citation-ref:hover) {
    text-decoration: underline !important;
  }

  /* Insert Citation Button */
  .insert-citation-btn {
    background: var(--color-secondary, #6b7280);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: var(--border-radius-sm);
    font-size: 0.9rem;
    cursor: pointer;
    transition: opacity 0.2s;
    margin: 0.5rem 0;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .insert-citation-btn:hover {
    opacity: 0.8;
  }

  /* Citation Picker Modal */
  .citation-picker-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .citation-picker-modal {
    background: var(--color-surface);
    border-radius: var(--border-radius-md);
    padding: 1.5rem;
    max-width: 600px;
    max-height: 70vh;
    overflow: auto;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  }

  .citation-picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .citation-picker-header h4 {
    margin: 0;
    color: var(--color-text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--color-text-secondary);
    padding: 0.25rem;
  }

  .close-btn:hover {
    color: var(--color-text-primary);
  }

  .citation-picker-content p {
    margin: 0 0 1rem 0;
    color: var(--color-text-secondary);
  }

  .reference-item {
    margin-bottom: 1rem;
  }

  .picker-references-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .picker-reference-item {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .picker-reference-item:hover {
    background: var(--color-surface-alt);
  }

  .picker-citation-number {
    font-weight: 600;
    color: var(--color-primary);
    min-width: 2rem;
  }

  .picker-citation-preview {
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .historical-description {
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    margin-top: 0.5rem;
  }

  .historical-description p {
    margin: 0 0 1rem 0;
  }

  .historical-description p:last-child {
    margin-bottom: 0;
  }
  .posts-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .post-card {
    background-color: var(--color-surface);
    padding: 1.5rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
  }
  .post-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
  }
  .post-content { line-height: 1.6; }
  .add-comment { margin-top: 3rem; }
  .add-comment-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; }
  .signin-hint { color: var(--color-text-secondary); }
  .comment-form { display: flex; flex-direction: column; gap: 0.75rem; }
  .comment-form textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-input-bg);
    color: var(--color-text-primary);
    resize: vertical;
  }
  .comment-form textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  .comment-actions { display: flex; justify-content: flex-end; }
  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-surface);
    padding: 0.6rem 1.2rem;
    border-radius: var(--border-radius-md);
    border: none;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
  .error-message { color: #ef4444; }
  .draft-status { 
    font-size: 0.75rem; 
    color: var(--color-text-secondary); 
    font-style: italic; 
    margin-left: auto; 
    align-self: center; 
  }
  .autosave-indicator { font-size:0.65rem; color: var(--color-text-secondary); min-height:0.9rem; display:flex; align-items:center; gap:0.35rem; }
  .pending-dot { width:6px; height:6px; border-radius:50%; background: var(--color-accent); display:inline-block; animation: pulse 1s linear infinite; }
  @keyframes pulse { 0% { opacity:0.2; } 50% { opacity:1; } 100% { opacity:0.2; } }
  .post-version-link { font-size:0.65rem; color:var(--color-primary); margin-left:0.5rem; }
  .post-version-link:hover { text-decoration:underline; }
  .edit-btn { margin-left:1rem; font-size:0.85rem; background:none; border:none; color:var(--color-primary); cursor:pointer; }
  .edit-btn:hover, .edit-btn:focus { text-decoration:underline; outline:none; }
  .edit-form { margin-top:1rem; display:flex; flex-direction:column; gap:0.75rem; background:var(--color-surface-alt); padding:1rem; border-radius:var(--border-radius-md); border:1px solid var(--color-border); }
  .edit-form label { font-size:0.85rem; font-weight:600; color:var(--color-text-secondary); margin-bottom:0.25rem; }
  .edit-form input[type=text], .edit-form textarea { width:100%; padding:0.5rem; border-radius:var(--border-radius-sm); border:1px solid var(--color-border); font:inherit; }
  .edit-form input:focus, .edit-form textarea:focus { outline:none; border-color:var(--color-primary); box-shadow:0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent); }
  .edit-autosave-indicator { font-size:0.75rem; color:var(--color-text-secondary); margin:0.5rem 0; min-height:1rem; }
  .historical-version-banner {
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    padding: 1rem;
    margin-bottom: 1.5rem;
    font-size: 0.95rem;
    color: var(--color-text-secondary);
  }
  .historical-version-banner strong { color: var(--color-accent); font-size:1.05rem; }
  .historical-title { font-weight:600; margin-top:0.5rem; }
  .historical-description { margin-top:0.25rem; }
  .return-current { margin-top:0.75rem; display:inline-block; color:var(--color-primary); font-size:0.85rem; }
  .return-current:hover { text-decoration:underline; }


  /* Writing Style Post Display */
  .writing-style-badge {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    border-radius: var(--border-radius-sm);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .writing-style-badge.journalistic {
    background: color-mix(in srgb, #3b82f6 10%, transparent);
    border-color: #3b82f6;
    color: #3b82f6;
  }

  .writing-style-badge.academic {
    background: color-mix(in srgb, #7c3aed 10%, transparent);
    border-color: #7c3aed;
    color: #7c3aed;
  }

  .journalistic-post {
    border-left: 4px solid #3b82f6;
  }

  .academic-post {
    border-left: 4px solid #7c3aed;
  }

  .post-metadata {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .post-metadata h5 {
    margin: 0 0 0.5rem 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .sources-list, .citations-list {
    margin: 0;
    font-size: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .source-item, .citation-item {
    padding: 0.75rem;
    background: var(--color-surface-alt);
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--color-border);
  }

  .source-header, .citation-header {
    margin-bottom: 0.5rem;
    line-height: 1.3;
  }

  .source-title, .citation-title {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .source-title {
    color: var(--color-primary);
    text-decoration: none;
  }

  .source-title:hover {
    text-decoration: underline;
  }

  .source-author, .citation-author,
  .source-date, .citation-date,
  .citation-publisher, .citation-page {
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  .source-point, .citation-point {
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  .source-quote, .citation-quote {
    font-style: italic;
    color: var(--color-text-secondary);
    padding-left: 0.5rem;
    border-left: 3px solid var(--color-border);
    margin-bottom: 0.5rem;
  }

  .citation-url {
    font-size: 0.75rem;
  }

  .citation-url a {
    color: var(--color-primary);
    text-decoration: none;
    word-break: break-all;
  }

  .citation-url a:hover {
    text-decoration: underline;
  }

  .access-date {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    font-style: italic;
    margin-left: 0.5rem;
  }

  /* Writing Style Selector */
  .writing-style-selector {
    margin-bottom: 1rem;
  }

  .style-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.5rem;
  }

  .style-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .style-option {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 2px solid var(--color-border);
    border-radius: var(--border-radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--color-surface);
  }

  .style-option:hover {
    border-color: color-mix(in srgb, var(--color-primary) 50%, transparent);
    background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  }

  .style-option.selected {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .style-option input[type="radio"] {
    margin: 0.2rem 0 0 0;
    width: 2rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .style-content {
    flex: 1;
  }

  .style-content strong {
    display: block;
    font-size: 0.875rem;
    color: var(--color-text-primary);
    margin-bottom: 0.25rem;
  }

  .style-content span {
    display: block;
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    margin-bottom: 0.25rem;
  }

  .style-content small {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  /* Citation Section */
  .citation-section {
    margin-bottom: 1rem;
    padding: 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    background: var(--color-surface-alt);
  }

  .citation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .citation-header h4 {
    margin: 0;
    font-size: 1rem;
    color: var(--color-text-primary);
  }

  .citations-list {
    margin-top: 1rem;
  }

  .citation-item {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    margin-bottom: 0.75rem;
  }

  .citation-content {
    flex: 1;
  }

  .citation-title {
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.25rem;
  }

  .citation-url a {
    color: var(--color-primary);
    text-decoration: none;
    font-size: 0.875rem;
  }

  .citation-url a:hover {
    text-decoration: underline;
  }

  .edit-btn {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font-size: 0.75rem;
    cursor: pointer;
    height: fit-content;
  }

  .edit-btn:hover {
    background: #2563eb;
  }

  .remove-btn {
    background: #ef4444;
    color: white;
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font-size: 0.75rem;
    cursor: pointer;
    height: fit-content;
  }

  .remove-btn:hover {
    background: #dc2626;
  }

  /* Style Validation */
  .style-validation-errors {
    margin-top: 1rem;
    padding: 0.75rem;
    background: color-mix(in srgb, #ef4444 10%, transparent);
    border: 1px solid #ef4444;
    border-radius: var(--border-radius-sm);
  }

  .style-validation-errors h5 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: #ef4444;
  }

  .style-validation-errors ul {
    margin: 0;
    padding-left: 1.25rem;
    color: #dc2626;
  }

  .style-validation-errors li {
    font-size: 0.8rem;
    margin-bottom: 0.25rem;
  }

  /* Additional source-specific styles */
  .source-accessed {
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  /* Citation Details Collapsible Styling */
  .citation-details {
    margin-top: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    overflow: hidden;
  }

  .citation-details summary {
    padding: 0.5rem 0.75rem;
    background: var(--color-surface-alt);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    border: none;
    outline: none;
    user-select: none;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .citation-details summary:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface-alt));
    color: var(--color-text-primary);
  }

  .citation-details summary::-webkit-details-marker {
    display: none;
  }

  .summary-arrow {
    font-size: 0.75rem;
    color: var(--color-primary);
    transition: transform 0.2s;
    font-family: monospace;
  }

  .citation-details[open] .summary-arrow {
    transform: rotate(90deg);
  }

  .summary-text {
    font-weight: 500;
  }

  .citation-details[open] summary {
    background: color-mix(in srgb, var(--color-primary) 15%, var(--color-surface-alt));
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border);
  }

  .citation-context {
    padding: 0.75rem;
    background: var(--color-surface);
  }

  .citation-point,
  .citation-quote {
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .citation-point:last-child,
  .citation-quote:last-child {
    margin-bottom: 0;
  }

  .citation-point strong,
  .citation-quote strong {
    color: var(--color-primary);
    font-weight: 600;
  }

  .citation-quote {
    font-style: italic;
    color: var(--color-text-secondary);
  }

  /* Auto-resizing textarea styles */
  #edit-description {
    min-height: 80px;
    resize: none;
    transition: height 0.1s ease-out;
    overflow-y: hidden;
    box-sizing: border-box;
  }

  /* Delete Button Styles */
  .delete-post-btn,
  .delete-discussion-btn {
    background: #ef4444;
    color: white;
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font-size: 0.75rem;
    cursor: pointer;
    margin-left: 0.5rem;
    transition: background-color 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .delete-post-btn:hover,
  .delete-discussion-btn:hover {
    background: #dc2626;
  }

  .delete-post-btn {
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
  }

  .delete-discussion-btn {
    font-size: 0.8rem;
    padding: 0.3rem 0.6rem;
  }
</style>
