export default function Badge({ type = "gray", children, style = {} }) {
    const colors = {
        green: "badge-green",
        red: "badge-red",
        amber: "badge-amber",
        blue: "badge-blue",
        purple: "badge-purple",
        gray: "badge-gray",
    };
    const cls = colors[type] || colors.gray;
    return (
        <span className={`badge ${cls}`} style={style}>
            {children}
        </span>
    );
}
