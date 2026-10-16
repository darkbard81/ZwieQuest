export function initPasswordInput(input, error) {
  const field = input.closest('.password-field');
  const cells = [...field.querySelectorAll('.password-cell')];
  let previous = '', previousCaret = 0;
  function message(text = '') {
    error.textContent = text;
    input.setAttribute('aria-invalid', String(!!text));
    field.classList.toggle('invalid', !!text);
  }
  function paint() {
    const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
    const focused = document.activeElement === input;
    cells.forEach((cell, i) => {
      cell.textContent = i < input.value.length ? '●' : '';
      cell.classList.toggle('current', focused && start === end && i === Math.min(start, 5));
      cell.classList.toggle('selected', focused && i >= start && i < end);
    });
  }
  function accept() {
    if (!/^[0-9]{0,6}$/.test(input.value)) {
      input.value = previous; input.setSelectionRange(previousCaret, previousCaret);
      message('0부터 9까지 숫자 6자리만 입력할 수 있어요.');
    } else {
      previous = input.value; previousCaret = input.selectionStart ?? previous.length;
      message();
    }
    paint();
  }
  function allowed(text) {
    const selected = (input.selectionEnd ?? 0) - (input.selectionStart ?? 0);
    return /^[0-9]*$/.test(text) && input.value.length - selected + text.length <= 6;
  }
  input.addEventListener('beforeinput', event => {
    if (event.inputType.startsWith('insert') && event.data !== null && !allowed(event.data)) {
      event.preventDefault(); message('0부터 9까지 숫자 6자리만 입력할 수 있어요.');
    }
  });
  input.addEventListener('paste', event => {
    event.preventDefault(); const text = event.clipboardData?.getData('text') ?? '';
    if (!allowed(text)) { message('붙여넣을 내용은 숫자만, 전체 6자리 이하여야 해요.'); return; }
    input.setRangeText(text, input.selectionStart ?? 0, input.selectionEnd ?? 0, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Tapping a cell positions the native caret; keyboard selection/backspace stays native.
  input.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); input.focus();
    const box = field.getBoundingClientRect();
    const index = Math.max(0, Math.min(5, Math.floor((event.clientX - box.left) / (box.width / 6))));
    const caret = Math.min(index, input.value.length);
    input.setSelectionRange(caret, caret); paint();
  });
  input.addEventListener('input', accept);
  for (const type of ['select', 'keyup', 'focus', 'blur']) input.addEventListener(type, paint);
  input.addEventListener('invalid', () => message('비밀번호는 숫자 6자리로 입력하세요.'));
  paint();
  return { clear() { input.value = ''; previous = ''; previousCaret = 0; message(); paint(); } };
}
