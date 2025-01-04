import random

def generate_html_visualization(results, output_file="visualizer_output.html"):
    label_colors = {}

    def get_color(label, score):
        if label not in label_colors:
            hue = random.randint(0, 359)
            label_colors[label] = hue
        hue = label_colors[label]
        lightness = 110 - 60 * score
        return f"hsl({hue}, 70%, {lightness}%)"

    html_blocks = []
    for entry in results:
        session_block = []
        for c in entry.get('analysis', []):
            chunk = c['chunk']
            if not c['scores']:
                session_block.append(f"<span>{chunk}</span>")
                continue
            top = max(c['scores'], key=lambda x: x['score'])
            score = min(max(top['score'], 0.1), 1)
            base_color = get_color(top['label'], score)
            tooltip = f"{top['label']}: {top['score']:.2f}"
            style = (
                f"background-color:{base_color}; padding:2px; margin:2px; line-height:30px;"
                f"cursor:help;"
            )
            session_block.append(f'<span style="{style}" title="{tooltip}">{chunk}</span>')
        html_blocks.append("<div>" + " ".join(session_block) + "</div>")

    # Generate legend for label-to-color mapping
    legend = "<div style='margin-bottom:20px;'><h3>Legend:</h3><ul>"
    for label, hue in label_colors.items():
        color = f"hsl({hue}, 70%, 60%)"
        legend += (
            f"<li style='list-style:none;'>"
            f"<span style='display:inline-block;width:15px;height:15px;background-color:{color};margin-right:5px;'></span>"
            f"{label}</li>"
        )
    legend += "</ul></div>"

    # Write to HTML file
    final_html = (
        "<html><body style='font-family:Arial, sans-serif;'>" +
        legend +
        "<hr/>".join(html_blocks) +
        "</body></html>"
    )
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(final_html)