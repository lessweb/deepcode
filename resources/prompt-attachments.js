(function () {
  const ATTACHMENT_LABEL = "粘贴的图像";
  const PREVIEW_OFFSET = 10;

  function createElement(tagName, className) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    return element;
  }

  function isImageFile(file) {
    return Boolean(file && typeof file.type === "string" && file.type.startsWith("image/"));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });
  }

  function pickImageFileFromDataTransfer(dataTransfer) {
    if (!dataTransfer) {
      return null;
    }

    const files = Array.from(dataTransfer.files || []);
    return files.find(isImageFile) || null;
  }

  function hasImageDataTransfer(dataTransfer) {
    if (!dataTransfer) {
      return false;
    }

    const items = Array.from(dataTransfer.items || []);
    if (items.some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
      return true;
    }

    const files = Array.from(dataTransfer.files || []);
    if (files.some(isImageFile)) {
      return true;
    }

    const types = Array.from(dataTransfer.types || []);
    return types.includes("Files");
  }

  function pickImageFileFromClipboard(event) {
    const items = Array.from(event.clipboardData?.items || []);
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (isImageFile(file)) {
          return file;
        }
      }
    }
    return null;
  }

  function createPromptAttachmentManager(options) {
    const promptInput = options?.promptInput;
    const inputWrap = options?.inputWrap;
    const toolsLine = options?.toolsLine;
    const dropZone = options?.dropZone || inputWrap;
    const onAttachmentChange = typeof options?.onAttachmentChange === "function"
      ? options.onAttachmentChange
      : function () {};

    if (!promptInput || !inputWrap || !toolsLine || !dropZone) {
      throw new Error("Prompt attachment manager requires promptInput, inputWrap, toolsLine, and dropZone.");
    }

    let attachment = null;
    let previewPopup = null;
    let previewImage = null;
    let dragDepth = 0;
    let dragOverlay = null;

    function ensureDragOverlay() {
      if (dragOverlay) {
        return dragOverlay;
      }

      dragOverlay = createElement("div", "chat-attachment-drop-overlay");
      const label = createElement("div", "chat-attachment-drop-overlay-text");
      label.textContent = "将图片附件为上下文";
      dragOverlay.appendChild(label);
      dropZone.appendChild(dragOverlay);
      return dragOverlay;
    }

    function showDragOverlay() {
      ensureDragOverlay().classList.add("show");
      dropZone.classList.add("drag-over");
    }

    function hideDragOverlay() {
      if (dragOverlay) {
        dragOverlay.classList.remove("show");
      }
      dropZone.classList.remove("drag-over");
    }

    function ensurePreviewPopup() {
      if (previewPopup) {
        return;
      }

      previewPopup = createElement("div", "chat-attached-context-preview");
      previewImage = createElement("img", "chat-attached-context-preview-image");
      previewImage.alt = ATTACHMENT_LABEL;
      previewPopup.appendChild(previewImage);
      document.body.appendChild(previewPopup);
    }

    function hidePreview() {
      if (!previewPopup) {
        return;
      }
      previewPopup.classList.remove("show");
    }

    function updatePreviewPosition(anchor) {
      if (!previewPopup || !anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const popupRect = previewPopup.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = rect.left;
      let top = rect.top - popupRect.height - PREVIEW_OFFSET;

      if (left + popupRect.width > viewportWidth - 12) {
        left = viewportWidth - popupRect.width - 12;
      }
      if (left < 12) {
        left = 12;
      }
      if (top < 12) {
        top = rect.bottom + PREVIEW_OFFSET;
      }
      if (top + popupRect.height > viewportHeight - 12) {
        top = Math.max(12, viewportHeight - popupRect.height - 12);
      }

      previewPopup.style.left = left + "px";
      previewPopup.style.top = top + "px";
    }

    function showPreview(anchor) {
      if (!attachment) {
        return;
      }

      ensurePreviewPopup();
      previewImage.src = attachment.dataUrl;
      previewPopup.classList.add("show");
      updatePreviewPosition(anchor);
    }

    function emitChange() {
      onAttachmentChange({
        hasAttachments: Boolean(attachment),
        attachments: attachment ? [attachment] : []
      });
    }

    function clearDragState() {
      dragDepth = 0;
      hideDragOverlay();
    }

    function clear() {
      attachment = null;
      toolsLine.innerHTML = "";
      toolsLine.classList.remove("has-attachment");
      hidePreview();
      emitChange();
    }

    function createAttachmentNode() {
      const wrapper = createElement(
        "div",
        "chat-attached-context-attachment show-file-icons"
      );
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "button");
      wrapper.setAttribute("aria-label", ATTACHMENT_LABEL + " (删除)");
      wrapper.draggable = true;

      const removeButton = createElement("a", "monaco-button codicon codicon-close");
      removeButton.tabIndex = -1;
      removeButton.setAttribute("role", "button");
      removeButton.setAttribute("aria-label", "从上下文中移除");
      removeButton.href = "#";
      removeButton.textContent = "×";
      removeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        clear();
      });

      const iconLabel = createElement("div", "monaco-icon-label");
      const iconLabelContainer = createElement("div", "monaco-icon-label-container");
      const iconNameContainer = createElement("span", "monaco-icon-name-container");
      iconLabelContainer.appendChild(iconNameContainer);
      iconLabel.appendChild(iconLabelContainer);

      const pill = createElement("div", "chat-attached-context-pill");
      const image = createElement("img", "chat-attached-context-pill-image");
      image.src = attachment.dataUrl;
      image.alt = ATTACHMENT_LABEL;
      pill.appendChild(image);

      const text = createElement("span", "chat-attached-context-custom-text");
      text.textContent = ATTACHMENT_LABEL;

      wrapper.appendChild(removeButton);
      wrapper.appendChild(iconLabel);
      wrapper.appendChild(pill);
      wrapper.appendChild(text);

      const show = () => showPreview(wrapper);
      wrapper.addEventListener("mouseenter", show);
      wrapper.addEventListener("focus", show);
      wrapper.addEventListener("mouseleave", hidePreview);
      wrapper.addEventListener("blur", hidePreview);
      wrapper.addEventListener("dragstart", (event) => {
        event.preventDefault();
      });
      wrapper.addEventListener("keydown", (event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          clear();
        }
      });

      return wrapper;
    }

    function render() {
      toolsLine.innerHTML = "";
      toolsLine.classList.toggle("has-attachment", Boolean(attachment));
      if (!attachment) {
        hidePreview();
        return;
      }
      toolsLine.appendChild(createAttachmentNode());
    }

    async function setAttachmentFromFile(file) {
      if (!isImageFile(file)) {
        return false;
      }

      const dataUrl = await readFileAsDataUrl(file);
      attachment = {
        name: file.name || ATTACHMENT_LABEL,
        mimeType: file.type || "image/png",
        dataUrl,
        label: ATTACHMENT_LABEL
      };
      render();
      emitChange();
      return true;
    }

    async function handlePaste(event) {
      const file = pickImageFileFromClipboard(event);
      if (!file) {
        return;
      }

      event.preventDefault();
      try {
        await setAttachmentFromFile(file);
      } catch (error) {
        console.error("Failed to attach pasted image.", error);
      }
    }

    async function handleDrop(event) {
      event.preventDefault();
      clearDragState();
      const file = pickImageFileFromDataTransfer(event.dataTransfer);
      if (!file) {
        return;
      }

      try {
        await setAttachmentFromFile(file);
      } catch (error) {
        console.error("Failed to attach dropped image.", error);
      }
    }

    promptInput.addEventListener("paste", handlePaste);

    function handleWindowDragEnter(event) {
      if (!hasImageDataTransfer(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      dragDepth += 1;
      showDragOverlay();
    }

    function handleWindowDragOver(event) {
      if (!hasImageDataTransfer(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      showDragOverlay();
    }

    function handleWindowDragLeave(event) {
      if (!hasImageDataTransfer(event.dataTransfer)) {
        return;
      }
      dragDepth = Math.max(0, dragDepth - 1);
      const leavingWindow = event.clientX <= 0
        || event.clientY <= 0
        || event.clientX >= window.innerWidth
        || event.clientY >= window.innerHeight;
      if (dragDepth === 0 || leavingWindow) {
        hideDragOverlay();
        dragDepth = 0;
      }
    }

    window.addEventListener("dragenter", handleWindowDragEnter, true);
    window.addEventListener("dragover", handleWindowDragOver, true);
    window.addEventListener("dragleave", handleWindowDragLeave, true);
    window.addEventListener("drop", handleDrop, true);
    window.addEventListener("dragend", clearDragState, true);

    window.addEventListener("resize", () => {
      const attachmentNode = toolsLine.querySelector(".chat-attached-context-attachment");
      if (previewPopup?.classList.contains("show") && attachmentNode) {
        updatePreviewPosition(attachmentNode);
      }
    });

    window.addEventListener("scroll", () => {
      const attachmentNode = toolsLine.querySelector(".chat-attached-context-attachment");
      if (previewPopup?.classList.contains("show") && attachmentNode) {
        updatePreviewPosition(attachmentNode);
      }
    }, true);

    return {
      clear,
      hasAttachments() {
        return Boolean(attachment);
      },
      getImageUrls() {
        return attachment ? [attachment.dataUrl] : [];
      }
    };
  }

  window.createPromptAttachmentManager = createPromptAttachmentManager;
})();
