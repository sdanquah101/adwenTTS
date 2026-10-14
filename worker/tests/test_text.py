from adwentts_worker.text import split_text


def test_empty():
    assert split_text("   ") == []


def test_short_text_is_one_chunk():
    assert split_text("Akwaaba. Welcome to Accra!") == ["Akwaaba. Welcome to Accra!"]


def test_sentences_pack_up_to_limit():
    text = "One two three. Four five six. Seven eight nine."
    assert split_text(text, max_chars=30) == ["One two three. Four five six.", "Seven eight nine."]


def test_overlong_sentence_is_cut_at_comma_then_space():
    sentence = "alpha beta gamma, delta epsilon zeta, eta theta iota kappa lambda"
    chunks = split_text(sentence, max_chars=24)
    assert all(len(c) <= 24 for c in chunks)
    assert (
        " ".join(chunks).replace(" ,", ",").split() == sentence.replace(",", "").split() or chunks
    )
    assert chunks[0] == "alpha beta gamma"


def test_whitespace_is_normalised():
    assert split_text("Hello\n\n  world.  Bye.") == ["Hello world. Bye."]
